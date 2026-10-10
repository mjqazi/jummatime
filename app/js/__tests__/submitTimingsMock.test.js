/**
 * Mock-mode submitTimings must merge the new times onto the mosque so the
 * post-submit getMosque re-fetch paints hero/drawer/list without a reload.
 */

const path = require('path');
const fs = require('fs');

function loadApi() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
  // eslint-disable-next-line no-eval
  window.eval(src);
  return window.api;
}

describe('js/api.js mock submitTimings applies times', () => {
  let api;

  beforeEach(() => {
    window.JAMAT_CONFIG = { apiBase: 'http://localhost:6001/api', useMockData: true };
    window.state = {
      mosques: [{
        id: 'm1',
        name: 'Central Jamia Masjid',
        defaultJamaatTimings: {
          fajr: '05:15',
          zuhr: '13:30',
          asr: '16:15',
          maghribOffset: 5,
          isha: '19:45',
          jummah: '13:30',
        },
      }],
      submissions: {},
      notifications: [],
    };
    window.storage = { saveMosqueCache: jest.fn(), getMosqueCache: jest.fn(() => null) };
    api = loadApi();
  });

  it('merges a partial Isha update into default and effective timings', async () => {
    const res = await api.submitTimings({
      mosqueId: 'm1',
      timings: { isha: '21:25', zuhr: undefined },
    });
    expect(res.applied).toBe(true);
    const mosque = window.state.mosques[0];
    expect(mosque.defaultJamaatTimings.isha).toBe('21:25');
    expect(mosque.defaultJamaatTimings.fajr).toBe('05:15');
    expect(mosque.effectiveTimings.isha).toBe('21:25');
    expect(mosque.effectiveTimings.zuhr).toBe('13:30');
    const fresh = await api.getMosque('m1');
    expect(fresh.defaultJamaatTimings.isha).toBe('21:25');
  });

  it('maps zuhr onto both zuhr and dhuhr so timingsFromMosque sees it', async () => {
    await api.submitTimings({
      mosqueId: 'm1',
      timings: { zuhr: '13:45' },
    });
    const mosque = window.state.mosques[0];
    expect(mosque.defaultJamaatTimings.zuhr).toBe('13:45');
    expect(mosque.defaultJamaatTimings.dhuhr).toBe('13:45');
  });
});
