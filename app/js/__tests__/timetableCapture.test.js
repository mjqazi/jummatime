/**
 * Timetable capture helpers in js/timetable-capture.js.
 *
 * The viewfinder itself needs a camera; these tests cover the pure parts:
 * the constraint plan built from a device's reported capabilities (the
 * Samsung SM-S918U1 capability dump is the reference), the per-pixel MAX
 * composite that defeats mains flicker, and the size fitting.
 */

const path = require('path');
const fs = require('fs');

function loadCapture() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'timetable-capture.js'), 'utf8');
  // eslint-disable-next-line no-eval
  window.eval(src);
  return window.JAMAT_TIMETABLE_CAPTURE;
}

// Verbatim from the phone probe (Chrome 152, rear camera).
const SAMSUNG_CAPS = {
  exposureCompensation: { max: 2, min: -2, step: 0.1 },
  exposureMode: ['continuous', 'manual'],
  exposureTime: { max: 1500.01124, min: 0.53848, step: 0.1 },
  focusMode: ['manual', 'single-shot', 'continuous'],
  iso: { max: 3200, min: 50, step: 1 },
  torch: true,
  whiteBalanceMode: ['continuous', 'manual'],
  width: { max: 4080, min: 1 },
  height: { max: 3060, min: 1 },
};

describe('buildConstraintPlan', () => {
  const C = loadCapture();

  it('asks the Samsung for darkest EV, 50 ms manual shutter, base ISO, continuous focus/WB, torch off', () => {
    const { plan, chosen } = C.buildConstraintPlan(SAMSUNG_CAPS);
    expect(chosen).toEqual({
      exposureCompensation: -2,
      exposureMode: 'manual',
      exposureTime: 500,
      iso: 50,
      focusMode: 'continuous',
      whiteBalanceMode: 'continuous',
      torch: false,
    });
    // Order matters: exposure mode before exposure time, ISO after both.
    const keys = plan.map((c) => Object.keys(c)[0]);
    expect(keys.indexOf('exposureMode')).toBeLessThan(keys.indexOf('exposureTime'));
    expect(keys.indexOf('exposureTime')).toBeLessThan(keys.indexOf('iso'));
    // Every entry is a single-key constraint so one rejection cannot sink the rest.
    plan.forEach((c) => expect(Object.keys(c)).toHaveLength(1));
  });

  it('keeps ISO at the device minimum even when manual shutter is unsupported', () => {
    const caps = { exposureCompensation: { min: -3, max: 3, step: 1 }, iso: { min: 100, max: 6400, step: 1 } };
    const { chosen } = C.buildConstraintPlan(caps);
    expect(chosen.iso).toBe(100);
    expect(chosen.exposureMode).toBeUndefined();
    expect(chosen.exposureTime).toBeUndefined();
    expect(chosen.exposureCompensation).toBe(-3);
  });

  it('clamps the shutter into the device range', () => {
    const fast = C.buildConstraintPlan({ exposureMode: ['manual'], exposureTime: { min: 1, max: 100, step: 1 } });
    expect(fast.chosen.exposureTime).toBe(100);
    const slow = C.buildConstraintPlan({ exposureMode: ['manual'], exposureTime: { min: 500, max: 2000, step: 1 } });
    expect(slow.chosen.exposureTime).toBe(500);
  });

  it('includes only keys the device reports', () => {
    expect(C.buildConstraintPlan({}).plan).toEqual([]);
    expect(C.buildConstraintPlan(null).plan).toEqual([]);
    const { plan } = C.buildConstraintPlan({ focusMode: ['manual'], torch: false });
    // 'continuous' focus not offered → no focus constraint; torch reported → torch off.
    expect(plan).toEqual([{ torch: false }]);
  });
});

describe('bracketPlan', () => {
  const C = loadCapture();

  it('is one stop brighter than the LED-first plan on the Samsung, ISO still minimum', () => {
    const { chosen } = C.buildConstraintPlan(SAMSUNG_CAPS);
    const b = C.bracketPlan(SAMSUNG_CAPS, chosen);
    expect(b.chosen).toEqual({ exposureCompensation: -1, exposureMode: 'manual', exposureTime: 1000, iso: 50 });
    b.plan.forEach((c) => expect(Object.keys(c)).toHaveLength(1));
  });

  it('clamps to the device maxima', () => {
    const caps = { exposureCompensation: { min: 0, max: 0.5, step: 0.1 }, exposureMode: ['manual'], exposureTime: { min: 1, max: 800, step: 1 } };
    const { chosen } = C.buildConstraintPlan(caps);
    expect(C.bracketPlan(caps, chosen).chosen).toEqual({ exposureCompensation: 0.5, exposureMode: 'manual', exposureTime: 800 });
  });

  it('returns null when the device has no exposure control', () => {
    const caps = { focusMode: ['continuous'] };
    expect(C.bracketPlan(caps, C.buildConstraintPlan(caps).chosen)).toBeNull();
    expect(C.bracketPlan(null, null)).toBeNull();
  });
});

describe('compositeMax', () => {
  const C = loadCapture();
  const W = 4; const H = 1;
  const frame = (pixels) => ({ width: W, height: H, data: new Uint8ClampedArray(pixels.flat()) });

  it('keeps a segment lit if it was lit in any frame (flicker defeat)', () => {
    // Four pixels; each frame lights a different one (simulated PWM phases).
    const f = [
      frame([[255, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255]]),
      frame([[0, 0, 0, 255], [0, 255, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255]]),
      frame([[0, 0, 0, 255], [0, 0, 0, 255], [255, 180, 20, 255], [0, 0, 0, 255]]),
      frame([[0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255], [20, 20, 20, 255]]),
    ];
    const out = C.compositeMax(f);
    expect(Array.from(out.data)).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 255, 180, 20, 255, 20, 20, 20, 255]);
    // Inputs untouched by default.
    expect(f[0].data[5]).toBe(0);
  });

  it('is per-channel, not per-pixel-winner', () => {
    const out = C.compositeMax([
      frame([[200, 10, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255]]),
      frame([[10, 200, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255]]),
    ]);
    expect(Array.from(out.data.slice(0, 4))).toEqual([200, 200, 0, 255]);
  });

  it('forces alpha to 255 and reuses the first buffer when asked', () => {
    const a = frame([[1, 2, 3, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    const out = C.compositeMax([a], true);
    expect(out.data).toBe(a.data);
    expect(out.data[3]).toBe(255);
  });

  it('rejects mismatched sizes and empty input', () => {
    expect(() => C.compositeMax([])).toThrow(/no frames/);
    expect(() => C.compositeMax([frame([[0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255]]), { width: 2, height: 1, data: new Uint8ClampedArray(8) }])).toThrow(/size mismatch/);
  });
});

describe('fitWithin and isSupported', () => {
  const C = loadCapture();

  it('scales the long edge down to the cap and never up', () => {
    expect(C.fitWithin(1920, 2560, 2400)).toEqual({ width: 1800, height: 2400, scale: 0.9375 });
    expect(C.fitWithin(1280, 720, 2400)).toEqual({ width: 1280, height: 720, scale: 1 });
  });

  it('is unsupported under jsdom (no mediaDevices) and reports the burst defaults', () => {
    expect(C.isSupported()).toBe(false);
    expect(C.BURST_FRAMES).toBe(10);
    expect(C.TARGET_EXPOSURE_TIME).toBe(500); // 100 µs units → 50 ms: whole cycles of 50 Hz and 60 Hz
  });

  it('spaces burst frames so no gap is a multiple of the 50 Hz or 60 Hz half-cycle', () => {
    expect(C.BURST_SCHEDULE_MS).toHaveLength(C.BURST_FRAMES);
    // Distance from the nearest multiple of the half-cycle, as a fraction
    // of the half-cycle: 0 = same phase as the previous frame, 0.5 = the
    // opposite phase. Anything under 0.15 (or over 0.85) is "same phase".
    const phaseDistance = (gap, halfCycleMs) => {
      const frac = (gap / halfCycleMs) % 1;
      return Math.min(frac, 1 - frac);
    };
    for (const gap of C.BURST_SCHEDULE_MS) {
      expect(phaseDistance(gap, 10)).toBeGreaterThanOrEqual(0.15);        // 50 Hz rectified: 10 ms
      expect(phaseDistance(gap, 1000 / 120)).toBeGreaterThanOrEqual(0.15); // 60 Hz rectified: 8.33 ms
    }
    // Ten frames must spread over several cycles, not sit inside one.
    const total = C.BURST_SCHEDULE_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(300);
    expect(total).toBeLessThan(600);
  });
});
