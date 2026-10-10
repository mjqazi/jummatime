/**
 * Scan/submit extras: the payload builder is a pure helper in components.js
 * so a photo state yields source + captureLocation + scan, and a manual
 * state yields source + captureLocation when a GPS fix is on the state.
 * clearScanSourceMarker is what clearScanSummary uses to drop the photo
 * marker on the form.
 */

const path = require('path');
const fs = require('fs');

function loadRender() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components.js'), 'utf8');
  // eslint-disable-next-line no-eval
  window.eval(src);
  return window.JAMAT_RENDER;
}

const PHOTO_STATE = {
  source: 'photo',
  captureLocation: { lat: 33.72, lng: 73.08, accuracyM: 20, at: '2026-09-07T12:00:00.000Z' },
  quality: 0.8,
  confidence: 'high',
  stats: {
    clockMatched: true,
    calibration: { matched: true, threshold: 0.42 },
    capture: { source: 'burst', frames: 10, chosen: 'dark' },
  },
};

describe('buildScanSubmissionExtras', () => {
  const R = loadRender();

  it('yields source, captureLocation, and a compact scan object for a photo state', () => {
    const extras = R.buildScanSubmissionExtras(PHOTO_STATE);
    expect(extras.source).toBe('photo');
    expect(extras.captureLocation).toEqual(PHOTO_STATE.captureLocation);
    expect(extras.scan).toEqual({
      clockMatched: true,
      calibrationThreshold: 0.42,
      quality: 0.8,
      confidence: 'high',
      capture: { source: 'burst', frames: 10, chosen: 'dark' },
    });
  });

  it('pulls source/frames from the dark burst when capture is nested', () => {
    const extras = R.buildScanSubmissionExtras({
      source: 'photo',
      stats: {
        clockMatched: false,
        capture: {
          chosen: 'bracket',
          dark: { source: 'burst', frames: 10 },
        },
      },
    });
    expect(extras.scan.capture).toEqual({ source: 'burst', frames: 10, chosen: 'bracket' });
  });

  it('yields only source: manual when there is no photo and no fix', () => {
    expect(R.buildScanSubmissionExtras(null)).toEqual({ source: 'manual' });
    expect(R.buildScanSubmissionExtras(undefined)).toEqual({ source: 'manual' });
    expect(R.buildScanSubmissionExtras({})).toEqual({ source: 'manual' });
  });

  it('sends captureLocation with a manual entry when a fix is on the state', () => {
    expect(R.buildScanSubmissionExtras({
      source: 'manual',
      captureLocation: PHOTO_STATE.captureLocation,
    })).toEqual({
      source: 'manual',
      captureLocation: PHOTO_STATE.captureLocation,
    });
  });
});

describe('clearScanSourceMarker / clearScanSummary', () => {
  const R = loadRender();

  it('clears the photo marker so a later manual submit is not mislabelled', () => {
    const form = document.createElement('form');
    form.dataset.scanSource = 'photo';
    R.clearScanSourceMarker(form);
    expect(form.dataset.scanSource).toBeUndefined();
    expect(R.buildScanSubmissionExtras(null)).toEqual({ source: 'manual' });
  });
});
