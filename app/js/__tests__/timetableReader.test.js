/**
 * On-device 7-segment timetable reader — stage tests and full-board cases.
 * Synthetic boards are rasterised to RGBA (no Canvas2D).
 */

const path = require('path');
const fs = require('fs');
const { renderBoard, referenceBoard, loadPng, loadJpeg } = require('./helpers/boardRender');

jest.setTimeout(30000);

function loadReader() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'timetable-reader.js'), 'utf8');
  // eslint-disable-next-line no-eval
  window.eval(src);
  return window.JAMAT_TIMETABLE_READER;
}

const Reader = loadReader();

function loadComponents() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components.js'), 'utf8');
  // eslint-disable-next-line no-eval
  window.eval(src);
  return window.JAMAT_RENDER;
}

const displays = (reading) => (reading.rows || []).map((r) => r.display);
const timeDisplays = (reading) => (reading.rows || []).filter((r) => r.kind === 'time').map((r) => r.display);

describe('reader stages', () => {
  const img = referenceBoard();

  it('builds a luminance plane with L = max(R,G,B)', () => {
    const plane = Reader.luminancePlane(img);
    expect(plane.L.length).toBe(img.width * img.height);
    expect(plane.chroma.length).toBe(plane.L.length);
    // A lit red LED pixel should be near 1; the black panel near 0.
    let peak = 0, floor = 1;
    for (let i = 0; i < plane.L.length; i++) {
      if (plane.L[i] > peak) peak = plane.L[i];
      if (plane.L[i] < floor) floor = plane.L[i];
    }
    expect(peak).toBeGreaterThan(0.8);
    expect(floor).toBeLessThan(0.15);
  });

  it('locates a panel smaller than the frame', () => {
    const plane = Reader.luminancePlane(img);
    const panel = Reader.locatePanel(plane);
    expect(panel.w).toBeGreaterThan(img.width * 0.4);
    expect(panel.h).toBeGreaterThan(img.height * 0.4);
    expect(panel.w).toBeLessThan(img.width);
    expect(panel.h).toBeLessThan(img.height);
    expect(panel.found).toBe(true);
  });

  it('crops then scales the panel to the requested long edge', () => {
    const plane = Reader.luminancePlane(img);
    const panel = Reader.locatePanel(plane);
    const scaled = Reader.cropAndScale(img, panel, 400);
    expect(Math.max(scaled.width, scaled.height)).toBe(400);
  });

  it('fits side edges and warps a keystoned board', () => {
    const keyed = referenceBoard({ keystone: 0.85 });
    const plane = Reader.luminancePlane(keyed);
    const panel = Reader.locatePanel(plane);
    const cropped = Reader.cropAndScale(keyed, panel, 800);
    const cropPlane = Reader.luminancePlane(cropped);
    const edges = Reader.fitSideEdges(cropPlane.L, cropped.width, cropped.height);
    expect(edges.left).toBeDefined();
    expect(edges.right).toBeDefined();
    const warped = Reader.warpTrapezoid(cropped, edges.left, edges.right);
    expect(warped.width).toBe(cropped.width);
    expect(warped.height).toBe(cropped.height);
  });

  it('builds raw and dilated LED masks', () => {
    const plane = Reader.luminancePlane(img);
    const panel = Reader.locatePanel(plane);
    const cropped = Reader.cropAndScale(img, panel, 800);
    const cropPlane = Reader.luminancePlane(cropped);
    const mask = Reader.ledMask(cropPlane);
    expect(mask.raw.length).toBe(cropped.width * cropped.height);
    expect(mask.dilated.length).toBe(mask.raw.length);
    let on = 0;
    for (let i = 0; i < mask.raw.length; i++) if (mask.raw[i]) on++;
    expect(on).toBeGreaterThan(100);
  });
});

describe('readTimetable on synthetic boards', () => {
  it('reads the Islamabad reference board', async () => {
    const img = referenceBoard();
    const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
    console.log('reference board stages', JSON.stringify(reading.stats.stages), 'ms', reading.stats.ms, 'rows', displays(reading));
    expect(reading.rows.some((r) => r.kind === 'clock' && r.display === '6:55:42')).toBe(true);
    const times = timeDisplays(reading);
    expect(times).toEqual(expect.arrayContaining(['4:50', '1:30', '5:15', '6:51', '8:45']));
    const maghrib = reading.rows.find((r) => r.display === '6:51');
    expect(maghrib.colour).toBe('green');
    expect(reading.stats.medianDigitHeight).toBeGreaterThan(20);
    expect(reading.panel).toEqual(expect.objectContaining({ warped: expect.any(Boolean) }));
  });

  it('reads 1:30 (or abstains) on a ghosted Zuhr row, never 8:30', async () => {
    const img = referenceBoard({ ghost: 0.35, ghostRows: [1] });
    const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
    const times = timeDisplays(reading);
    const zuhrish = times.filter((t) => t === '1:30' || t === '8:30');
    expect(zuhrish).not.toContain('8:30');
    // Either we kept 1:30 or we dropped the row entirely.
    expect(times.includes('8:30')).toBe(false);
  });

  it('reads a green Maghrib row', async () => {
    const img = referenceBoard();
    const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
    const maghrib = reading.rows.find((r) => r.display === '6:51');
    expect(maghrib).toBeTruthy();
    expect(maghrib.colour).toBe('green');
  });

  it('reads a keystoned board (top/bottom 0.85)', async () => {
    const img = referenceBoard({ keystone: 0.85 });
    const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
    const times = timeDisplays(reading);
    expect(times).toEqual(expect.arrayContaining(['4:50', '1:30', '5:15', '6:51', '8:45']));
  });

  it('reads a 24-hour board', async () => {
    const img = renderBoard({
      width: 900,
      height: 1200,
      clock: { text: '18:55:42' },
      rows: [
        { text: '04:50' },
        { text: '13:30' },
        { text: '17:15' },
        { text: '18:51', colour: 'green' },
        { text: '20:45' },
      ],
      extras: [],
    });
    const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
    const times = timeDisplays(reading);
    expect(reading.rows.some((r) => r.kind === 'clock' && r.hh > 12)).toBe(true);
    expect(reading.rows.some((r) => r.hh > 12)).toBe(true);
    expect(times).toEqual(expect.arrayContaining(['04:50', '18:51', '20:45']));
  });

  it('abstains on a board with no colons', async () => {
    const img = renderBoard({
      colons: false,
      colonGap: 4,
      extras: [],
    });
    const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
    expect(reading.rows.filter((r) => r.kind === 'time' || r.kind === 'clock')).toHaveLength(0);
  });

  it('returns zero rows on a paper-like low-contrast image', async () => {
    const img = renderBoard({ paper: true, wall: [210, 208, 200], panelColor: [200, 198, 190] });
    const reading = await Reader.readTimetable(img, { cropLongEdge: 800 });
    expect(reading.rows).toHaveLength(0);
  });

  it('filters reference extras as extras and now reads them correctly', async () => {
    const img = referenceBoard();
    const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
    const times = timeDisplays(reading);
    expect(times).toEqual(expect.arrayContaining(['4:50', '1:30', '5:15', '6:51', '8:45']));
    expect(times).toEqual(expect.arrayContaining(['4:53', '12:05', '8:24']));
    const extra453 = reading.rows.find((r) => r.kind === 'time' && r.display === '4:53');
    expect(extra453).toBeTruthy();
    expect(extra453.confidence).toBeGreaterThanOrEqual(0.5);
    const extra1205 = reading.rows.find((r) => r.kind === 'time' && r.display === '12:05');
    expect(extra1205).toBeTruthy();
    const extra824 = reading.rows.find((r) => r.kind === 'time' && r.display === '8:24');
    expect(extra824).toBeTruthy();
  });
});

function digitChars(display) {
  return String(display).replace(/:/g, '').split('');
}

function rowDigitsOkOrUnsure(row, expectedDisplay) {
  if (!row) return true;
  if ((row.confidence || 0) < 0.5) return true;
  const got = digitChars(row.display);
  const want = digitChars(expectedDisplay);
  if (got.length !== want.length) return false;
  for (let i = 0; i < want.length; i++) {
    const d = row.digits && row.digits[i];
    if (got[i] === want[i]) continue;
    if (d && (d.value == null || d.confidence < 0.5)) continue;
    return false;
  }
  return true;
}

describe('A1 colon-adjacent digits never high-confidence-wrong', () => {
  const texts = ['4:53', '12:05', '8:24', '1:33', '3:15', '0:05'];
  const scales = [0.5, 0.62, 0.75, 0.9, 1.0];
  const lefts = [0.05, 0.58];

  for (const text of texts) {
    for (const scale of scales) {
      for (const leftFrac of lefts) {
        it(`${text} heightScale=${scale} leftFrac=${leftFrac}`, async () => {
          const img = renderBoard({
            extras: [{ text, leftFrac, heightScale: scale }],
          });
          const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
          const times = reading.rows.filter((r) => r.kind === 'time');
          for (const row of times) {
            if (row.display === '4:58' && row.confidence >= 0.5) {
              throw new Error(`${text} s=${scale} L=${leftFrac} yielded 4:58 @ ${row.confidence}`);
            }
            if (row.display === text) {
              expect(rowDigitsOkOrUnsure(row, text)).toBe(true);
            } else if ((row.confidence || 0) >= 0.5) {
              const jamat = ['4:50', '1:30', '5:15', '6:51', '8:45', '1:30'];
              if (!jamat.includes(row.display) && row.display !== text) {
                // A confident extra/jamat hybrid is only allowed if every
                // digit is correct-or-unsure against the rendered extra.
                const extraLeft = times.filter((r) => r.leftX > 400);
                for (const er of extraLeft) {
                  expect(rowDigitsOkOrUnsure(er, text) || er.confidence < 0.5).toBe(true);
                }
              }
            }
          }
          const confident458 = times.filter((r) => r.display === '4:58' && r.confidence >= 0.5);
          expect(confident458).toHaveLength(0);
        });
      }
    }
  }

  it('row 4:53 never yields 4:58 with confidence ≥ 0.5 at any scale', async () => {
    for (const scale of scales) {
      for (const leftFrac of lefts) {
        const img = renderBoard({ extras: [{ text: '4:53', leftFrac, heightScale: scale }] });
        const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
        const bad = (reading.rows || []).filter((r) => r.display === '4:58' && r.confidence >= 0.5);
        expect(bad).toHaveLength(0);
      }
    }
  });
});

describe('A2 every rendered jamat row appears in rows', () => {
  const sets = ['1:33', '1:11', '11:11', '10:00', '7:17'];

  function rowPresent(times, text) {
    if (times.includes(text)) return true;
    // A2: the row must not vanish. A misread of the same digit-count is still
    // a present time row (possibly low-confidence).
    const wantN = text.replace(/:/g, '').length;
    return times.some((t) => t.replace(/[?:]/g, '').length === wantN && t.includes(':'));
  }

  it('keeps 4:53 / 1:33 / 3:15 / 6:51 / 8:45 / 1:30', async () => {
    const wanted = ['4:53', '1:33', '3:15', '6:51', '8:45', '1:30'];
    const img = renderBoard({
      extras: [],
      rows: wanted.map((text, i) => ({ text, colour: i === 3 ? 'green' : 'red' })),
    });
    const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
    const times = timeDisplays(reading);
    expect(times.length).toBe(wanted.length);
    for (const w of wanted) expect(rowPresent(times, w)).toBe(true);
  });

  for (const text of sets) {
    it(`jamat column includes ${text}`, async () => {
      const rows = [
        { text: '4:50' },
        { text },
        { text: '5:15' },
        { text: '6:51', colour: 'green' },
        { text: '8:45' },
        { text: '1:30' },
      ];
      const img = renderBoard({ extras: [], rows });
      const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
      const times = timeDisplays(reading);
      expect(times.length).toBe(6);
      expect(rowPresent(times, text)).toBe(true);
    });
  }

  it('a jamat column of the five digit-sets keeps every row', async () => {
    const rows = sets.map((text, i) => ({ text, colour: i === 3 ? 'green' : 'red' }));
    const img = renderBoard({ extras: [], rows });
    const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
    const times = timeDisplays(reading);
    expect(times.length).toBe(sets.length);
    for (const text of sets) expect(rowPresent(times, text)).toBe(true);
  });
});

describe('scan-fixtures accuracy harness', () => {
  const dir = path.join(__dirname, '..', '..', 'scan-fixtures');
  const ids = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => {
      if (name.startsWith('.') || name === 'README.md') return false;
      try { return fs.statSync(path.join(dir, name)).isDirectory(); }
      catch { return false; }
    })
    : [];

  if (ids.length === 0) {
    it('passes when scan-fixtures is empty', () => {
      expect(ids).toEqual([]);
    });
    return;
  }

  const Render = loadComponents();

  for (const id of ids) {
    it(`fixture ${id}: high-confidence-wrong rate is 0`, async () => {
      const folder = path.join(dir, id);
      const files = fs.readdirSync(folder);
      const photo = files.find((f) => /\.(jpe?g)$/i.test(f)) || files.find((f) => /\.png$/i.test(f));
      const truth = JSON.parse(fs.readFileSync(path.join(folder, 'truth.json'), 'utf8'));
      expect(photo).toBeTruthy();
      const image = /\.png$/i.test(photo)
        ? loadPng(path.join(folder, photo))
        : loadJpeg(path.join(folder, photo));
      const t0 = Date.now();
      const reading = await Reader.readTimetable(image, { cropLongEdge: 1600 });
      const ms = Date.now() - t0;
      const result = Render.normalizeTimetableScan(reading, {
        windows: null,
        clientLocalTime: null,
        today: new Date(),
      });

      let digitTotal = 0, digitHit = 0, filled = 0, correct = 0, extraSuppressed = 0;
      const expected = truth.rows || {};
      for (const prayer of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jummah']) {
        const want = Array.isArray(expected[prayer]) ? expected[prayer][0] : expected[prayer];
        const row = (result.rows || []).find((r) => r.prayer === prayer);
        if (!want) continue;
        digitTotal++;
        if (row && row.display === want) digitHit++;
        if (row && (row.status === 'ok' || row.status === 'flag')) {
          filled++;
          const got = row.display;
          if (got === want) correct++;
          else if (row.confidence >= 0.8) {
            throw new Error(`high-confidence wrong: ${prayer} got ${got} want ${want}`);
          }
        }
      }
      const extras = result.extras || [];
      for (const e of truth.extras || []) {
        if (extras.includes(e)) extraSuppressed++;
      }
      const recall = digitTotal ? digitHit / digitTotal : 1;
      console.log(`fixture ${id}: recall=${recall.toFixed(2)} extra=${extraSuppressed}/${(truth.extras || []).length} ms=${ms} digits=${digitHit}/${digitTotal}`);
      expect(filled - correct).toBeGreaterThanOrEqual(0); // high-confidence-wrong already thrown
    });
  }
});
