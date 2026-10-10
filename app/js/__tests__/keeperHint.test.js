/**
 * Drawer keeper-credit hint: i18n keys + date formatted in the app language.
 * Builder lives on JAMAT_RENDER.keeperSourceHint (js/components.js).
 */

const fs = require('fs');
const path = require('path');

function loadI18n() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'i18n.js'), 'utf8');
  // eslint-disable-next-line no-eval
  window.eval(src);
  return window.i18n;
}

function loadRender() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components.js'), 'utf8');
  // eslint-disable-next-line no-eval
  window.eval(src);
  return window.JAMAT_RENDER;
}

function mosque(overrides) {
  return {
    effectiveKeeperId: 'k1',
    preferredKeeperId: null,
    effectiveKeeperIsCurrentSchedule: false,
    effectiveKeeperIsVerifiedSchedule: false,
    effectiveKeeperSource: null,
    effectiveKeeperUpdatedAt: '2026-09-06T12:00:00',
    ...overrides,
  };
}

describe('keeperSourceHint', () => {
  let i18n;
  let hint;
  let dateEn;

  beforeEach(async () => {
    localStorage.clear();
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => require('../../data/jumma-copy.json') }));
    i18n = loadI18n();
    await i18n.set('en');
    hint = loadRender().keeperSourceHint;
    dateEn = new Date('2026-09-06T12:00:00').toLocaleDateString('en', {
      month: 'short',
      day: 'numeric',
    });
  });

  afterEach(() => {
    localStorage.clear();
    delete window.i18n;
    delete window.JAMAT_RENDER;
    delete global.fetch;
  });

  it('returns empty when there is no effective keeper', () => {
    expect(hint({})).toBe('');
    expect(hint({ effectiveKeeperId: null })).toBe('');
  });

  it('English: preferred keeper with date', () => {
    expect(hint(mosque({ preferredKeeperId: 'k1' })))
      .toBe(`Tap to change · Updated ${dateEn}`);
  });

  it('English: preferred keeper without date', () => {
    expect(hint(mosque({ preferredKeeperId: 'k1', effectiveKeeperUpdatedAt: null })))
      .toBe('Tap to change keeper');
  });

  it('English: verified current schedule with date', () => {
    expect(hint(mosque({
      effectiveKeeperIsCurrentSchedule: true,
      effectiveKeeperIsVerifiedSchedule: true,
    }))).toBe(`Verified schedule · Updated ${dateEn}`);
  });

  it('English: current schedule with date', () => {
    expect(hint(mosque({ effectiveKeeperIsCurrentSchedule: true })))
      .toBe(`Current schedule · Updated ${dateEn}`);
  });

  it('English: schedule history with date', () => {
    expect(hint(mosque({ effectiveKeeperSource: 'prayerSchedule' })))
      .toBe(`Schedule history · Updated ${dateEn}`);
  });

  it('English: top trusted with date', () => {
    expect(hint(mosque({})))
      .toBe(`Top trusted · Updated ${dateEn}`);
  });

  it('English: missing effectiveKeeperUpdatedAt yields the no-date variant', () => {
    expect(hint(mosque({ effectiveKeeperUpdatedAt: null }))).toBe('Top trusted');
    expect(hint(mosque({
      effectiveKeeperIsCurrentSchedule: true,
      effectiveKeeperUpdatedAt: null,
    }))).toBe('Current schedule');
    expect(hint(mosque({
      effectiveKeeperIsCurrentSchedule: true,
      effectiveKeeperIsVerifiedSchedule: true,
      effectiveKeeperUpdatedAt: null,
    }))).toBe('Verified schedule');
    expect(hint(mosque({
      effectiveKeeperSource: 'prayerSchedule',
      effectiveKeeperUpdatedAt: null,
    }))).toBe('Schedule history');
  });

  it('Urdu tap-change hint contains تبدیل, not Tap, and substitutes the date', async () => {
    const ur = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'i18n', 'ur.json'), 'utf8'));
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('ur.json')) {
        return { ok: true, json: async () => ur };
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    try {
      await i18n.set('ur');
      expect(i18n.current()).toBe('ur');
      const out = hint(mosque({ preferredKeeperId: 'k1' }));
      expect(out).toContain('تبدیل');
      expect(out).not.toMatch(/Tap/);
      expect(out).not.toContain('{date}');
      const dateUr = new Date('2026-09-06T12:00:00').toLocaleDateString('ur', {
        month: 'short',
        day: 'numeric',
      });
      expect(out).toContain(dateUr);
      expect(out).toBe(`تبدیل کرنے کے لیے دبائیں · ${dateUr} کو اپ ڈیٹ ہوا`);

      const noDate = hint(mosque({ preferredKeeperId: 'k1', effectiveKeeperUpdatedAt: null }));
      expect(noDate).toBe('نگہبان تبدیل کرنے کے لیے دبائیں');
      expect(noDate).not.toMatch(/Tap/);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
