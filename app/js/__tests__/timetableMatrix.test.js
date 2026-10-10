/**
 * Confidence matrix (SPEC_ADDENDUM_MATRIX) — nine owner-ruling cases.
 */

const path = require('path');
const fs = require('fs');

function loadRender() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components.js'), 'utf8');
  // eslint-disable-next-line no-eval
  window.eval(src);
  return window.JAMAT_RENDER;
}

const R = loadRender();

const ISB_WINDOWS = {
  fajr: { start: '04:19', end: '05:45' },
  dhuhr: { start: '12:06', end: '16:39' },
  asr: { start: '16:39', end: '18:28' },
  maghrib: { start: '18:28', end: '19:53' },
  isha: { start: '19:53', end: '04:20' },
  jummah: { start: '12:06', end: '16:39' },
};

function timeRow(display, y, opts) {
  const p = R.parseBoardClock(display);
  return {
    kind: 'time',
    display,
    hh: p.h,
    mm: p.m,
    confidence: (opts && opts.confidence) != null ? opts.confidence : 1,
    bbox: { x: 40, y, w: 120, h: 40 },
    digitHeight: 40,
    leftX: 40,
    colour: (opts && opts.colour) || 'red',
    digits: [],
    alternatives: (opts && opts.alternatives) || [],
  };
}

function clockRow(display) {
  const p = R.parseBoardClock(display);
  return {
    kind: 'clock',
    display,
    hh: p.h, mm: p.m, ss: p.s,
    confidence: 1,
    bbox: { x: 40, y: 0, w: 240, h: 80 },
    digitHeight: 80,
    leftX: 40,
    colour: 'red',
    digits: [],
  };
}

const REF_TIMES = [
  timeRow('4:50', 100),
  timeRow('1:30', 150),
  timeRow('5:15', 200),
  timeRow('6:51', 250, { colour: 'green' }),
  timeRow('8:45', 300),
  timeRow('1:30', 350),
];

function readingWith(times) {
  return {
    panel: { x: 0, y: 0, w: 100, h: 100, warped: false },
    rows: [clockRow('6:55:42'), ...times],
    stats: { medianDigitHeight: 40, ms: 1 },
  };
}

const CURRENT = { fajr: '04:50', dhuhr: '13:30', asr: '17:10', isha: '20:45', jummah: '13:30' };

function byPrayer(rows) {
  return Object.fromEntries(rows.map((r) => [r.prayer, r]));
}

describe('scoreScanRow / matrix (SPEC_ADDENDUM_MATRIX)', () => {
  it('1. reference board vs current 04:50/13:30/17:10/20:45/13:30: Asr ok, rest ok, Jummah ok', () => {
    const out = R.normalizeTimetableScan(readingWith(REF_TIMES), {
      windows: ISB_WINDOWS,
      clientLocalTime: '18:56:00',
      today: new Date('2026-09-06'),
      current: CURRENT,
    });
    const by = byPrayer(out.rows);
    expect(by.asr.time24).toBe('17:15');
    expect(by.asr.status).toBe('ok');
    expect(by.asr.signals.s4).toBe(0.95);
    expect(by.asr.signals.s3).toBe(1);
    expect(by.fajr.status).toBe('ok');
    expect(by.dhuhr.status).toBe('ok');
    expect(by.isha.status).toBe('ok');
    expect(by.jummah.status).toBe('ok');
    expect(by.jummah.time24).toBe('13:30');
    expect(out.unread).toEqual([]);
  });

  it('2. current Jummah 13:00 → Jummah 13:30 is flag jummah-changed, still filled', () => {
    const out = R.normalizeTimetableScan(readingWith(REF_TIMES), {
      windows: ISB_WINDOWS,
      clientLocalTime: '18:56:00',
      today: new Date('2026-09-06'),
      current: { ...CURRENT, jummah: '13:00' },
    });
    const jummah = byPrayer(out.rows).jummah;
    expect(jummah.status).toBe('flag');
    expect(jummah.reason).toBe('jummah-changed');
    expect(jummah.time24).toBe('13:30');
    expect(out.timings.jummah).toEqual(['13:30']);
  });

  it('3. Jummah digit conf 0.7 vs current 13:00 → unread, keeps current, summary shows “1:30”', () => {
    const times = REF_TIMES.map((r, i) => (i === 5 ? { ...r, confidence: 0.7 } : r));
    const out = R.normalizeTimetableScan(readingWith(times), {
      windows: ISB_WINDOWS,
      clientLocalTime: '18:56:00',
      today: new Date('2026-09-06'),
      current: { ...CURRENT, jummah: '13:00' },
    });
    const jummah = byPrayer(out.rows).jummah;
    expect(jummah.confidence).toBeCloseTo(0.35, 5);
    expect(jummah.status).toBe('unread');
    expect(jummah.time24).toBeNull();
    expect(jummah.display).toBe('1:30');
    expect(out.timings.jummah).toBeUndefined();
    expect(out.unread).toContain('jummah');
  });

  it('4. Dhuhr primary 8:30 / alt 1:30 → displayed 1:30, flag, alt-by-prior', () => {
    const times = [
      timeRow('4:50', 100),
      timeRow('8:30', 150, { alternatives: ['1:30'] }),
      timeRow('5:15', 200),
      timeRow('6:51', 250, { colour: 'green' }),
      timeRow('8:45', 300),
      timeRow('1:30', 350),
    ];
    const out = R.normalizeTimetableScan(readingWith(times), {
      windows: ISB_WINDOWS,
      clientLocalTime: '18:56:00',
      today: new Date('2026-09-06'),
      current: CURRENT,
    });
    const dhuhr = byPrayer(out.rows).dhuhr;
    expect(dhuhr.display).toBe('1:30');
    expect(dhuhr.time24).toBe('13:30');
    expect(dhuhr.status).toBe('flag');
    expect(dhuhr.reason).toBe('alt-by-prior');
  });

  it('5. 4:53 / alt 4:58 in the column: no alt chosen, S3 0.45 → unread', () => {
    const scored = R.scoreScanRow({
      prayer: 'fajr',
      display: '4:53',
      time24: '04:53',
      confidence: 1,
      alternatives: ['4:58'],
      rowIndex: 0,
    }, { windows: ISB_WINDOWS, current: CURRENT, boardIs24h: false });
    expect(scored.display).toBe('4:53');
    expect(scored.signals.s3).toBe(0.45);
    expect(scored.status).toBe('unread');
    expect(scored.time24).toBeNull();
    expect(scored.reason).toBe('odd-minutes');
  });

  it('6. Asr 17:15 with current 14:00 (>120 min) → flag big-change', () => {
    const out = R.normalizeTimetableScan(readingWith(REF_TIMES), {
      windows: ISB_WINDOWS,
      clientLocalTime: '18:56:00',
      today: new Date('2026-09-06'),
      current: { ...CURRENT, asr: '14:00' },
    });
    const asr = byPrayer(out.rows).asr;
    expect(asr.signals.s4).toBe(0.6);
    expect(asr.status).toBe('flag');
    expect(asr.reason).toBe('big-change');
    expect(asr.changeMinutes).toBe(195);
    expect(asr.time24).toBe('17:15');
  });

  it('7. Fajr 04:52 odd minutes → unread; Fajr 04:55 → ok', () => {
    const odd = R.scoreScanRow({
      prayer: 'fajr', display: '4:52', time24: '04:52', confidence: 1, rowIndex: 0,
    }, { windows: ISB_WINDOWS, boardIs24h: false });
    expect(odd.signals.s3).toBe(0.45);
    expect(odd.status).toBe('unread');
    expect(odd.display).toBe('4:52');
    expect(odd.time24).toBeNull();

    const five = R.scoreScanRow({
      prayer: 'fajr', display: '4:55', time24: '04:55', confidence: 1, rowIndex: 0,
    }, { windows: ISB_WINDOWS, boardIs24h: false });
    expect(five.signals.s3).toBe(0.85);
    expect(five.confidence).toBeCloseTo(0.85, 5);
    expect(five.status).toBe('ok');
    expect(five.time24).toBe('04:55');
  });

  it('8. windows === null → S2 0.8; fully confident round reading is still ok', () => {
    const round = timeRow('1:30', 150, { confidence: 1 });
    const out = R.normalizeTimetableScan(readingWith([
      timeRow('4:50', 100),
      round,
      timeRow('5:15', 200),
      timeRow('6:51', 250, { colour: 'green' }),
      timeRow('8:45', 300),
      timeRow('1:30', 350),
    ]), {
      windows: null,
      clientLocalTime: '18:56:00',
      today: new Date('2026-09-06'),
    });
    const by = byPrayer(out.rows);
    expect(by.dhuhr.signals.s2).toBe(0.8);
    expect(by.dhuhr.confidence).toBeCloseTo(0.8, 5);
    expect(by.dhuhr.status).toBe('ok');
    expect(by.asr.status).toBe('ok');
    expect(by.isha.status).toBe('ok');
    expect(by.jummah.status).toBe('ok');
  });

  it('9. signals on every row; reason keys resolve in every locale', () => {
    const out = R.normalizeTimetableScan(readingWith(REF_TIMES), {
      windows: ISB_WINDOWS,
      clientLocalTime: '18:56:00',
      today: new Date('2026-09-06'),
      current: CURRENT,
    });
    for (const row of out.rows) {
      expect(row.signals).toEqual(expect.objectContaining({
        s1: expect.any(Number),
        s2: expect.any(Number),
        s3: expect.any(Number),
        s4: expect.any(Number),
      }));
    }
    const keys = [
      'scan.reason.outsideWindow',
      'scan.reason.jummah',
      'scan.reason.alt',
      'scan.reason.oddMinutes',
      'scan.reason.bigChange',
      'scan.reason.lowDigits',
    ];
    const dir = path.join(__dirname, '..', '..', 'i18n');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(9);
    for (const f of files) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const k of keys) {
        expect(typeof j[k]).toBe('string');
        expect(j[k].length).toBeGreaterThan(0);
      }
    }
  });
});
