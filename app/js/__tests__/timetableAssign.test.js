/**
 * Row → prayer assignment: vertical order in the jamat column assigns;
 * sun windows resolve 12h→24h and validate.
 *
 * Windows are the Islamabad 2026-09-06 shape from the spec
 * (Fajr 04:19–05:45, Dhuhr 12:06–16:39, Asr 16:39–18:28,
 * Maghrib 18:28–19:53, Isha 19:53–04:20).
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

function timeRow(display, opts) {
  const p = R.parseBoardClock(display);
  const leftX = opts && opts.leftX != null ? opts.leftX : 80;
  const digitHeight = opts && opts.digitHeight != null ? opts.digitHeight : 40;
  const y = opts && opts.y != null ? opts.y : 0;
  return {
    kind: 'time',
    display,
    hh: p.h,
    mm: p.m,
    confidence: opts && opts.confidence != null ? opts.confidence : 0.95,
    bbox: { x: leftX, y, w: 120, h: digitHeight },
    digitHeight,
    leftX,
    colour: 'red',
    digits: [],
  };
}

const REF_COLUMN = [
  timeRow('4:50', { y: 10 }),
  timeRow('1:30', { y: 60 }),
  timeRow('5:15', { y: 110 }),
  timeRow('6:51', { y: 160 }),
  timeRow('8:45', { y: 210 }),
  timeRow('1:30', { y: 260 }),
];

describe('assignRowsToPrayers', () => {
  it('maps the Islamabad reference rows by vertical order', () => {
    const extras = [
      timeRow('4:53', { leftX: 260, digitHeight: 24, y: 80 }),
      timeRow('12:05', { leftX: 260, digitHeight: 24, y: 130 }),
      timeRow('8:24', { leftX: 260, digitHeight: 22, y: 280 }),
    ];
    const { rows, extras: dropped } = R.assignRowsToPrayers(
      [...REF_COLUMN, ...extras], ISB_WINDOWS, { today: new Date('2026-09-06') },
    );
    const by = Object.fromEntries(rows.map((r) => [r.prayer, r]));
    expect(by.fajr.time24).toBe('04:50');
    expect(by.dhuhr.time24).toBe('13:30');
    expect(by.asr.time24).toBe('17:15');
    expect(by.maghrib.time24).toBe('18:51');
    expect(by.isha.time24).toBe('20:45');
    expect(by.jummah.time24).toBe('13:30');
    expect(rows.every((r) => r.status === 'ok' || r.status === 'flag')).toBe(true);
    expect(dropped).toEqual(expect.arrayContaining(['4:53', '12:05', '8:24']));
  });

  it('drops 4:53 as an extra because of the column filter', () => {
    const extras = [timeRow('4:53', { leftX: 260, digitHeight: 24, y: 80 })];
    const { extras: dropped } = R.assignRowsToPrayers(
      [...REF_COLUMN, ...extras], ISB_WINDOWS, {},
    );
    expect(dropped).toContain('4:53');
  });

  it('if 4:53 were in the column it would lose the Asr slot to 5:15 by vertical order', () => {
    const seven = [
      timeRow('4:50', { y: 10 }),
      timeRow('1:30', { y: 60 }),
      timeRow('5:15', { y: 110 }),
      timeRow('4:53', { y: 140 }),
      timeRow('6:51', { y: 180 }),
      timeRow('8:45', { y: 230 }),
      timeRow('1:30', { y: 280 }),
    ];
    const { rows } = R.assignRowsToPrayers(seven, ISB_WINDOWS, {});
    const by = Object.fromEntries(rows.map((r) => [r.prayer, r]));
    expect(by.asr.time24).toBe('17:15');
    expect(by.asr.display).toBe('5:15');
  });

  it('resolves AM/PM from the prayer window, not from the phone clock', () => {
    const { rows } = R.assignRowsToPrayers(REF_COLUMN, ISB_WINDOWS, {});
    const by = Object.fromEntries(rows.map((r) => [r.prayer, r]));
    expect(by.fajr.time24).toBe('04:50');
    expect(by.dhuhr.time24).toBe('13:30');
    expect(by.isha.time24).toBe('20:45');
  });

  it('keeps a single Dhuhr-window row as dhuhr on Friday', () => {
    const friday = new Date('2026-09-04T12:00:00+05:00'); // Friday
    const onlyDhuhr = [timeRow('1:30', { y: 60 })];
    const { rows } = R.assignRowsToPrayers(onlyDhuhr, ISB_WINDOWS, { today: friday });
    const by = Object.fromEntries(rows.map((r) => [r.prayer, r]));
    expect(by.dhuhr.time24).toBe('13:30');
    expect(by.jummah.status).toBe('unread');
  });

  it('handles the Isha wrap past midnight', () => {
    const ishaLate = [
      timeRow('4:50', { y: 10 }),
      timeRow('1:30', { y: 60 }),
      timeRow('5:15', { y: 110 }),
      timeRow('6:51', { y: 160 }),
      timeRow('12:15', { y: 210 }),
    ];
    const { rows } = R.assignRowsToPrayers(ishaLate, ISB_WINDOWS, {});
    const isha = rows.find((r) => r.prayer === 'isha');
    expect(isha.time24).toBe('00:15');
    expect(isha.status).not.toBe('unread');
  });

  it('assigns regular layout by order when windows are null', () => {
    const { rows } = R.assignRowsToPrayers(REF_COLUMN, null, {});
    const by = Object.fromEntries(rows.map((r) => [r.prayer, r]));
    expect(by.fajr.time24).toBe('04:50');
    expect(by.dhuhr.time24).toBe('13:30');
    expect(by.asr.time24).toBe('17:15');
    expect(by.maghrib.time24).toBe('18:51');
    expect(by.isha.time24).toBe('20:45');
    expect(by.jummah.time24).toBe('13:30');
  });

  it('marks everything unread with no-windows on an irregular layout without coordinates', () => {
    const four = REF_COLUMN.slice(0, 4);
    const { rows } = R.assignRowsToPrayers(four, null, {});
    expect(rows.every((r) => r.status === 'unread')).toBe(true);
    expect(rows.every((r) => r.reason === 'no-windows')).toBe(true);
  });

  it('marks a row outside its assigned window as unread and keeps the display', () => {
    const badAsr = [
      timeRow('4:50', { y: 10 }),
      timeRow('1:30', { y: 60 }),
      timeRow('11:00', { y: 110 }),
      timeRow('6:51', { y: 160 }),
      timeRow('8:45', { y: 210 }),
    ];
    const { rows } = R.assignRowsToPrayers(badAsr, ISB_WINDOWS, {});
    const asr = rows.find((r) => r.prayer === 'asr');
    expect(asr.status).toBe('unread');
    expect(asr.reason).toBe('outside-window');
    expect(asr.display).toBe('11:00');
    expect(asr.time24).toBeNull();
  });
});

describe('normalizeTimetableScan (reading shape)', () => {
  it('produces the §5 result from a reader output', () => {
    const reading = {
      panel: { x: 0, y: 0, w: 100, h: 200, warped: false },
      rows: [
        { kind: 'clock', display: '6:55:42', hh: 6, mm: 55, ss: 42, confidence: 0.95, digitHeight: 60, leftX: 80, bbox: { x: 80, y: 0, w: 200, h: 60 }, digits: [] },
        ...REF_COLUMN,
      ],
      stats: { medianDigitHeight: 40, ms: 12 },
    };
    const out = R.normalizeTimetableScan(reading, {
      windows: ISB_WINDOWS,
      clientLocalTime: '18:56:00',
      today: new Date('2026-09-06'),
    });
    expect(out.timings).toEqual({
      fajr: '04:50',
      dhuhr: '13:30',
      asr: '17:15',
      maghrib: '18:51',
      isha: '20:45',
      jummah: ['13:30'],
    });
    expect(out.unread).toEqual([]);
    expect(out.boardClock.time).toBe('18:55:42');
    expect(out.boardClock.driftMinutes).toBe(0);
    expect(out.confidence).toBe('high');
    expect(out.quality).toBe(1);
    expect(out.stats.is24h).toBe(false);
  });
});
