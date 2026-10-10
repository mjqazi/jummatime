/**
 * Timetable photo scan helpers in js/components.js.
 *
 * The reference board (Islamabad, LED panel) reads: Fajr 4:50, Zuhr 1:30,
 * Asr 5:15, Maghrib 6:51, Isha 8:45, Jummah 1:30, clock 6:55:42. The
 * server normalizes that to 24-hour times; these tests cover what the
 * client does with them — diffing against the pre-filled form and
 * describing board-clock drift — without a DOM or a backend.
 */

const path = require('path');
const fs = require('fs');

function loadRender() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components.js'), 'utf8');
  // eslint-disable-next-line no-eval
  window.eval(src);
  return window.JAMAT_RENDER;
}

const SCANNED = { fajr: '04:50', dhuhr: '13:30', asr: '17:15', maghrib: '18:51', isha: '20:45', jummah: ['13:30'] };

describe('scanTimingsDiff', () => {
  const R = loadRender();

  it('flags only the prayers whose board time differs from the form', () => {
    const current = { fajr: '04:50', dhuhr: '13:30', asr: '17:10', isha: '20:45', jummah: '13:30' };
    const rows = R.scanTimingsDiff(current, SCANNED, []);
    expect(rows.map(r => r.key)).toEqual(['fajr', 'dhuhr', 'asr', 'isha', 'jummah']);
    expect(rows.find(r => r.key === 'asr')).toEqual({ key: 'asr', from: '17:10', to: '17:15', status: 'changed', onBoard: true });
    expect(rows.filter(r => r.status === 'changed').map(r => r.key)).toEqual(['asr']);
    expect(rows.filter(r => r.status === 'unchanged')).toHaveLength(4);
  });

  it('treats a blank form as all-new and never touches maghrib', () => {
    const rows = R.scanTimingsDiff({}, SCANNED, []);
    expect(rows.every(r => r.status === 'new')).toBe(true);
    expect(rows.some(r => r.key === 'maghrib')).toBe(false);
  });

  it('marks rows the board did not show as unread and leaves the form value alone', () => {
    const rows = R.scanTimingsDiff({ asr: '17:10' }, { ...SCANNED, asr: undefined, jummah: [] }, ['asr', 'jummah']);
    const asr = rows.find(r => r.key === 'asr');
    expect(asr.status).toBe('unread');
    expect(asr.onBoard).toBe(false);
    expect(asr.from).toBe('17:10');
    expect(asr.to).toBe('');
    expect(rows.find(r => r.key === 'jummah').status).toBe('unread');
  });

  it('normalizes loose clock strings before comparing so 5:15 equals 05:15', () => {
    const rows = R.scanTimingsDiff({ fajr: '4:50' }, { fajr: '04:50' }, []);
    expect(rows[0].status).toBe('unchanged');
  });
});

describe('scanDriftDescriptor', () => {
  const R = loadRender();

  it('reports matching clocks for zero or missing drift', () => {
    expect(R.scanDriftDescriptor(0)).toEqual({ key: 'scan.driftNone', params: {} });
    expect(R.scanDriftDescriptor(null)).toEqual({ key: 'scan.driftNone', params: {} });
  });

  it('reports the board ahead or behind with an absolute minute count', () => {
    expect(R.scanDriftDescriptor(3)).toEqual({ key: 'scan.driftAhead', params: { n: 3 } });
    expect(R.scanDriftDescriptor(-7)).toEqual({ key: 'scan.driftBehind', params: { n: 7 } });
  });
});
