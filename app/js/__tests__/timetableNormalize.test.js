/**
 * Pure-function coverage for the timetable photo pipeline. No database,
 * no model: the raw readings below are what the vision step returns for
 * the three reference photos of the Islamabad board that drove this
 * feature (LED panel, Arabic labels, running clock on top).
 *
 * Reference board (photo 1 and 3, taken a few seconds apart):
 *   clock 6:55:42 / 6:55:45 · فجر 4:50 · ظهر 1:30 · عصر 5:15 ·
 *   مغرب 6:51 · عشاء 8:45 · جمعه 1:30 · extra row "عصر 4:53" (Asr start,
 *   must be ignored) · bottom "8:24" (end-time row, must be ignored).
 * Photo 2 (same board, late morning):
 *   clock 11:43:38 · same jamat rows except مغرب 6:47 · ظهر row shows
 *   ghost segments ("8:30" look-alike, real value 1:30) · extra row
 *   "ظهر 12:05" (Zuhr start, ignored).
 */

const path = require('path');
const fs = require('fs');

function loadRender() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components.js'), 'utf8');
  // eslint-disable-next-line no-eval
  window.eval(src);
  return window.JAMAT_RENDER;
}

const {
  normalizeTimetableScan,
  parseBoardClock,
  resolveBoardClock,
  toPrayerTime24,
} = loadRender();

const ISB_WINDOWS = {
  fajr: { start: '04:19', end: '05:45' },
  dhuhr: { start: '12:06', end: '16:39' },
  asr: { start: '16:39', end: '18:28' },
  maghrib: { start: '18:28', end: '19:53' },
  isha: { start: '19:53', end: '04:20' },
  jummah: { start: '12:06', end: '16:39' },
};

function fakeDigit(value, confidence) {
  return { value, confidence, pattern: 0, scores: null };
}

function clockRow(display, opts) {
  const p = parseBoardClock(display);
  return {
    kind: 'clock',
    display,
    hh: p.h, mm: p.m, ss: p.s,
    confidence: (opts && opts.confidence) != null ? opts.confidence : 1,
    bbox: { x: 40, y: 0, w: 240, h: 80 },
    digitHeight: 80,
    leftX: 40,
    colour: 'red',
    digits: String(display).replace(/:/g, '').split('').map((ch) => fakeDigit(+ch, 1)),
  };
}

function timeRow(display, y, opts) {
  const p = parseBoardClock(display);
  return {
    kind: 'time',
    display,
    hh: p.h, mm: p.m,
    confidence: (opts && opts.confidence) != null ? opts.confidence : 0.95,
    bbox: { x: 40, y, w: 120, h: 40 },
    digitHeight: 40,
    leftX: 40,
    colour: (opts && opts.colour) || 'red',
    digits: String(display).replace(/:/g, '').split('').map((ch) => fakeDigit(+ch, 0.95)),
  };
}

function readingFromRows(clockDisplay, times) {
  const rows = [clockRow(clockDisplay)];
  times.forEach((spec, i) => {
    const display = typeof spec === 'string' ? spec : spec.text;
    const extra = typeof spec === 'string' ? undefined : spec;
    rows.push(timeRow(display, 100 + i * 50, extra));
  });
  return {
    panel: { x: 0, y: 0, w: 100, h: 100, warped: false },
    rows,
    stats: { medianDigitHeight: 40, ms: 1 },
  };
}

const EVENING_READING = readingFromRows('6:55:42', [
  '4:50', '1:30', '5:15', { text: '6:51', colour: 'green' }, '8:45', '1:30',
]);
const MORNING_READING = readingFromRows('11:43:38', [
  '4:50', '1:30', '5:15', { text: '6:47', colour: 'green' }, '8:45', '1:30',
]);
const REF_READING = EVENING_READING;

describe('parseBoardClock', () => {
  it('accepts the digit shapes boards actually print', () => {
    expect(parseBoardClock('6:55:42')).toEqual({ h: 6, m: 55, s: 42 });
    expect(parseBoardClock('11:43')).toEqual({ h: 11, m: 43, s: 0 });
    expect(parseBoardClock(' 4.50 ')).toEqual({ h: 4, m: 50, s: 0 });
    expect(parseBoardClock('04 50')).toEqual({ h: 4, m: 50, s: 0 });
  });

  it('rejects things that are not a clock', () => {
    expect(parseBoardClock(null)).toBeNull();
    expect(parseBoardClock('')).toBeNull();
    expect(parseBoardClock('--:--')).toBeNull();
    expect(parseBoardClock('25:00')).toBeNull();
    expect(parseBoardClock('4:75')).toBeNull();
  });
});

describe('toPrayerTime24', () => {
  it('lifts the reference board into 24-hour jamat times', () => {
    expect(toPrayerTime24('fajr', '4:50')).toBe('04:50');
    expect(toPrayerTime24('dhuhr', '1:30')).toBe('13:30');
    expect(toPrayerTime24('asr', '5:15')).toBe('17:15');
    expect(toPrayerTime24('maghrib', '6:51')).toBe('18:51');
    expect(toPrayerTime24('isha', '8:45')).toBe('20:45');
    expect(toPrayerTime24('jummah', '1:30')).toBe('13:30');
  });

  it('keeps morning-side Dhuhr/Jummah and midnight-side Isha sane', () => {
    expect(toPrayerTime24('dhuhr', '12:15')).toBe('12:15');
    expect(toPrayerTime24('jummah', '11:45')).toBe('11:45');
    expect(toPrayerTime24('isha', '12:15')).toBe('00:15');
    expect(toPrayerTime24('fajr', '12:30')).toBe('00:30');
  });

  it('passes 24-hour readings through untouched', () => {
    expect(toPrayerTime24('asr', '17:15')).toBe('17:15');
    expect(toPrayerTime24('isha', '20:45')).toBe('20:45');
  });

  it('returns null for unreadable rows', () => {
    expect(toPrayerTime24('asr', null)).toBeNull();
    expect(toPrayerTime24('asr', '')).toBeNull();
    expect(toPrayerTime24('asr', '--:--')).toBeNull();
  });
});

describe('resolveBoardClock', () => {
  it('picks the PM reading when the phone says evening and reports drift', () => {
    const r = resolveBoardClock('6:55:42', '18:56:10');
    expect(r).toEqual({ display: '6:55:42', time: '18:55:42', driftMinutes: 0 });
  });

  it('picks the AM reading late morning', () => {
    const r = resolveBoardClock('11:43:38', '11:41:00');
    expect(r?.time).toBe('11:43:38');
    expect(r?.driftMinutes).toBe(3);
  });

  it('reports a board running slow as negative drift', () => {
    const r = resolveBoardClock('6:55:42', '19:03:00');
    expect(r?.time).toBe('18:55:42');
    expect(r?.driftMinutes).toBe(-7);
  });

  it('handles a 12:xx board clock against a phone just past midnight or noon', () => {
    expect(resolveBoardClock('12:02', '00:03')?.time).toBe('00:02:00');
    expect(resolveBoardClock('12:02', '12:03')?.time).toBe('12:02:00');
  });

  it('keeps the AM reading and null drift when the phone clock is absent', () => {
    expect(resolveBoardClock('6:55:42')).toEqual({ display: '6:55:42', time: '06:55:42', driftMinutes: null });
  });

  it('returns null when the board has no clock', () => {
    expect(resolveBoardClock(null, '18:00')).toBeNull();
  });
});

describe('normalizeTimetableScan', () => {
  const eveningOpts = {
    windows: ISB_WINDOWS,
    clientLocalTime: '18:56:00',
    today: new Date('2026-09-06T18:56:00'),
  };

  it('turns the evening reference photo into a submission-ready payload', () => {
    const out = normalizeTimetableScan(EVENING_READING, eveningOpts);
    expect(out.timings).toEqual({
      fajr: '04:50',
      dhuhr: '13:30',
      asr: '17:15',
      maghrib: '18:51',
      isha: '20:45',
      jummah: ['13:30'],
    });
    expect(out.unread).toEqual([]);
    expect(out.boardClock).toEqual({ display: '6:55:42', time: '18:55:42', driftMinutes: 0, confidence: 1 });
    expect(out.confidence).toBe('high');
    expect(out.quality).toBe(1);
  });

  it('reads the late-morning photo of the same board consistently', () => {
    const out = normalizeTimetableScan(MORNING_READING, {
      windows: ISB_WINDOWS,
      clientLocalTime: '11:44:00',
      today: new Date('2026-09-06T11:44:00'),
    });
    expect(out.timings.dhuhr).toBe('13:30');
    expect(out.timings.maghrib).toBe('18:47');
    expect(out.boardClock?.time).toBe('11:43:38');
    expect(out.boardClock?.driftMinutes).toBe(0);
    expect(out.stats.clockMatched).toBe(true);
    expect(out.unread).toEqual([]);
  });

  it('lists rows the board did not show so the client can leave them blank', () => {
    const reading = readingFromRows('6:55:42', [
      '4:50', '1:30', { text: '6:51', colour: 'green' }, '8:45',
    ]);
    const out = normalizeTimetableScan(reading, eveningOpts);
    expect(out.timings.asr).toBeUndefined();
    expect(out.timings.jummah).toBeUndefined();
    expect(out.unread).toEqual(expect.arrayContaining(['asr', 'jummah']));
    expect(out.rows.find((r) => r.prayer === 'asr').status).toBe('unread');
    expect(out.rows.find((r) => r.prayer === 'jummah').status).toBe('unread');
  });

  it('keeps a single Jummah when the board repeats the same time on two rows', () => {
    const dup = readingFromRows('6:55:42', [
      '4:50', '1:30', '5:15', { text: '6:51', colour: 'green' }, '8:45', '1:30', '1:30',
    ]);
    const out = normalizeTimetableScan(dup, eveningOpts);
    expect(out.timings.jummah).toEqual(['13:30']);
    expect(out.extras).toEqual(expect.arrayContaining(['1:30']));
  });
});

function loadReader() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'timetable-reader.js'), 'utf8');
  // eslint-disable-next-line no-eval
  window.eval(src);
  return window.JAMAT_TIMETABLE_READER;
}

describe('clock calibration (SPEC_ADDENDUM_CLOCK)', () => {
  const Reader = loadReader();
  const { referenceBoard } = require('./helpers/boardRender');
  void Reader;

  it('ghost 0.47: sweep recovers 6:55:42 and the jamat rows', async () => {
    const img = referenceBoard({
      ghost: 0.47,
      ghostClock: 0.47,
      ghostRows: [0, 1, 2, 3, 4, 5],
    });
    const reading = await window.JAMAT_TIMETABLE_READER.readTimetable(img, { cropLongEdge: 1600 });
    const out = normalizeTimetableScan(reading, {
      windows: ISB_WINDOWS,
      clientLocalTime: '18:55:42',
      today: new Date('2026-09-06T18:55:42'),
    });
    expect(out.stats.calibration.matched).toBe(true);
    expect(out.boardClock).toBeTruthy();
    expect(out.boardClock.display).toBe('6:55:42');
    expect(out.stats.calibration.threshold).toBe(0.55);
    const by = Object.fromEntries(out.rows.map((r) => [r.prayer, r]));
    expect(by.fajr.display).toBe('4:50');
    expect(by.dhuhr.display).toBe('1:30');
    expect(by.asr.display).toBe('5:15');
    expect(by.maghrib.display).toBe('6:51');
    expect(by.isha.display).toBe('8:45');
  });

  it('dead clock 3 h off: boardClock null, no row reaches ok', () => {
    const reading = {
      ...REF_READING,
      rows: [
        clockRow('3:55:42'),
        timeRow('4:50', 100),
        timeRow('1:30', 150),
        timeRow('5:15', 200),
        timeRow('6:51', 250, { colour: 'green' }),
        timeRow('8:45', 300),
        timeRow('1:30', 350),
      ],
    };
    const out = normalizeTimetableScan(reading, {
      windows: ISB_WINDOWS,
      clientLocalTime: '18:55:42',
      today: new Date('2026-09-06T18:55:42'),
    });
    expect(out.boardClock).toBeNull();
    expect(out.stats.clockMatched).toBe(false);
    expect(out.stats.calibration.matched).toBe(false);
    expect(out.rows.filter((r) => r.status === 'ok')).toHaveLength(0);
  });

  it('clock 11:59 vs phone 12:05 still matches; AM/PM follows the phone', () => {
    const reading = {
      ...REF_READING,
      rows: [
        clockRow('11:59:00'),
        ...REF_READING.rows.filter((r) => r.kind === 'time'),
      ],
    };
    const out = normalizeTimetableScan(reading, {
      windows: ISB_WINDOWS,
      clientLocalTime: '12:05:00',
      today: new Date('2026-09-06T12:05:00'),
    });
    expect(out.stats.calibration.matched).toBe(true);
    expect(out.boardClock).toBeTruthy();
    expect(out.boardClock.time.startsWith('11:59')).toBe(true);
    expect(Math.abs(out.boardClock.driftMinutes)).toBeLessThanOrEqual(20);
  });

  it('green row assigned to the current prayer is unchanged; mismatch halves confidence', () => {
    const matchReading = {
      ...REF_READING,
      rows: [clockRow('6:40:00'), ...REF_READING.rows.filter((r) => r.kind === 'time')],
    };
    const match = normalizeTimetableScan(matchReading, {
      windows: ISB_WINDOWS,
      clientLocalTime: '18:40:00',
      today: new Date('2026-09-06T18:40:00'),
    });
    const maghrib = match.rows.find((r) => r.prayer === 'maghrib');
    expect(maghrib.confidence).toBeGreaterThanOrEqual(0.9);
    expect(maghrib.reason).not.toBe('colour-mismatch');

    const mismatchReading = {
      ...REF_READING,
      rows: [clockRow('5:00:00'), ...REF_READING.rows.filter((r) => r.kind === 'time')],
    };
    const mismatch = normalizeTimetableScan(mismatchReading, {
      windows: ISB_WINDOWS,
      clientLocalTime: '17:00:00',
      today: new Date('2026-09-06T17:00:00'),
    });
    const maghrib2 = mismatch.rows.find((r) => r.prayer === 'maghrib');
    expect(maghrib2.reason).toBe('colour-mismatch');
    expect(maghrib2.confidence).toBeCloseTo(0.475, 2);
  });
});
