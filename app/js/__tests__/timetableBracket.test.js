/**
 * Reader-driven exposure bracketing: which burst to keep, and when the
 * brighter alternate is worth decoding at all. Pure functions on the
 * §5 result — no camera, no DOM.
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

function result({ clockMatched, quality, ok = 0, flag = 0, unread = 0 } = {}) {
  const rows = [];
  const push = (status, n) => {
    for (let i = 0; i < n; i++) rows.push({ prayer: `p${rows.length}`, status });
  };
  push('ok', ok);
  push('flag', flag);
  push('unread', unread);
  return {
    quality: quality,
    rows,
    stats: { clockMatched: !!clockMatched },
  };
}

describe('shouldTryBracket', () => {
  it('skips the brighter burst when the clock matched and quality is at least 0.6', () => {
    expect(R.shouldTryBracket(result({ clockMatched: true, quality: 0.6, ok: 3 }))).toBe(false);
    expect(R.shouldTryBracket(result({ clockMatched: true, quality: 1, ok: 5 }))).toBe(false);
  });

  it('reads the alternate when the clock did not match, even at high quality', () => {
    expect(R.shouldTryBracket(result({ clockMatched: false, quality: 1, ok: 5 }))).toBe(true);
  });

  it('reads the alternate when quality is below 0.6, even with a matched clock', () => {
    expect(R.shouldTryBracket(result({ clockMatched: true, quality: 0.4, ok: 2 }))).toBe(true);
    expect(R.shouldTryBracket(result({ clockMatched: true, quality: 0, flag: 5 }))).toBe(true);
  });
});

describe('chooseScanResult', () => {
  it('returns dark when the bracket is null', () => {
    const dark = result({ clockMatched: false, quality: 0, flag: 5 });
    expect(R.chooseScanResult(dark, null)).toBe(dark);
  });

  it('prefers the result whose board clock matched the phone', () => {
    const dark = result({ clockMatched: false, quality: 1, ok: 5 });
    const bracket = result({ clockMatched: true, quality: 0.2, ok: 1 });
    expect(R.chooseScanResult(dark, bracket)).toBe(bracket);
    expect(R.chooseScanResult(bracket, dark)).toBe(bracket);
  });

  it('breaks a clock-match tie on higher quality', () => {
    const dark = result({ clockMatched: true, quality: 0.4, ok: 2 });
    const bracket = result({ clockMatched: true, quality: 0.8, ok: 4 });
    expect(R.chooseScanResult(dark, bracket)).toBe(bracket);
    expect(R.chooseScanResult(bracket, dark)).toBe(bracket);
  });

  it('breaks a quality tie on more ok rows', () => {
    const dark = result({ clockMatched: true, quality: 0.6, ok: 2, flag: 3 });
    const bracket = result({ clockMatched: true, quality: 0.6, ok: 3, flag: 2 });
    expect(R.chooseScanResult(dark, bracket)).toBe(bracket);
  });

  it('keeps dark when clock, quality, and ok-count are equal', () => {
    const dark = result({ clockMatched: true, quality: 0.6, ok: 3 });
    const bracket = result({ clockMatched: true, quality: 0.6, ok: 3 });
    expect(R.chooseScanResult(dark, bracket)).toBe(dark);
  });
});

describe('scanHasAnyReading', () => {
  it('is false when every row is unread or there are no rows', () => {
    expect(R.scanHasAnyReading(result({ quality: 0, unread: 5 }))).toBe(false);
    expect(R.scanHasAnyReading({ quality: 0, rows: [] })).toBe(false);
    expect(R.scanHasAnyReading(null)).toBe(false);
  });

  it('is true when any row is ok or flag, even if quality is 0', () => {
    expect(R.scanHasAnyReading(result({ quality: 0, flag: 5 }))).toBe(true);
    expect(R.scanHasAnyReading(result({ quality: 0.2, ok: 1, unread: 4 }))).toBe(true);
  });
});
