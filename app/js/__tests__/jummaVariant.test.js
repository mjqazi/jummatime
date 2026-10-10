const fs = require('node:fs');
const path = require('node:path');

describe('Jummah-first variant', () => {
  let R;
  beforeEach(() => {
    window.eval(fs.readFileSync(path.join(__dirname, '../components.js'), 'utf8'));
    R = window.JAMAT_RENDER;
    jest.useFakeTimers();
  });
  afterEach(() => { jest.useRealTimers(); delete window.JAMAT_RENDER; });

  const timings = { fajr: '05:00', zuhr: '13:00', asr: '16:00', isha: '20:00',
    jummah: '13:15', jummah_2: '14:00', jummah_3: '14:45' };

  it('ignores daily prayers on Saturday and targets the following Friday', () => {
    jest.setSystemTime(new Date('2026-10-10T10:00:00'));
    const next = R.computeNextJummah(timings);
    expect(next.key).toBe('jummah');
    expect(next.target.getDay()).toBe(5);
    expect(next.target.getDate()).toBe(16);
    expect(R.computeNextPrayer(timings).key).toBe('dhuhr');
  });

  it('advances through remaining Friday sessions, including the exact boundary', () => {
    jest.setSystemTime(new Date('2026-10-09T13:15:00'));
    expect(R.computeNextJummah(timings).key).toBe('jummah_2');
    jest.setSystemTime(new Date('2026-10-09T14:01:00'));
    expect(R.computeNextJummah(timings).key).toBe('jummah_3');
  });

  it('rolls to the next Friday after the final session', () => {
    jest.setSystemTime(new Date('2026-10-09T15:00:00'));
    expect(R.computeNextJummah(timings).target.getDate()).toBe(16);
  });

  it('does not invent Jummah from daily times or invalid clock values', () => {
    jest.setSystemTime(new Date('2026-10-09T10:00:00'));
    expect(R.computeNextJummah({ zuhr: '13:00' })).toBeNull();
    expect(R.computeNextJummah({ jummah: '25:61' })).toBeNull();
  });

  it('normalizes shared-backend arrays and selects the next session', () => {
    jest.setSystemTime(new Date('2026-10-09T13:30:00'));
    const t = R.timingsFromMosque({ effectiveTimings: { jummah: ['13:15', '14:00', '14:45'] } });
    expect(R.computeNextJummah(t).key).toBe('jummah_2');
    expect(R.orderedTimingKeysForDate(new Date(), t, { jummahFirst: true })).toEqual(['jummah', 'jummah_2', 'jummah_3', 'fajr', 'asr', 'maghrib', 'isha']);
  });

  it('never displays a daily next prayer as Jummah in a directory card', () => {
    jest.setSystemTime(new Date('2026-10-09T10:00:00'));
    const card = R.renderCard({ id: 'missing', name: 'Local Masjid', effectiveTimings: { dhuhr: '13:00' } });
    expect(card.textContent).toContain('Jummah time not added yet');
    expect(card.querySelector('.card__next-time')).toBeNull();
  });
});
