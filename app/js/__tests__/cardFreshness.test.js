/**
 * Schedule age on directory cards (renderCardFreshness in components.js).
 * The drawer already said "updated N days ago"; the card showed a Verified
 * badge next to months-old times. These lock in the three states.
 */
const fs = require('node:fs');
const path = require('node:path');

let R;
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-10T12:00:00Z'));
  window.eval(fs.readFileSync(path.join(__dirname, '../components.js'), 'utf8'));
  R = window.JAMAT_RENDER;
});
afterEach(() => { jest.useRealTimers(); delete window.JAMAT_RENDER; });

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const mosque = (updatedAt) => ({ id: 'm', name: 'Test Masjid', effectiveTimings: { jummah: ['13:30'] }, effectiveKeeperUpdatedAt: updatedAt });

describe('scheduleAgeDays', () => {
  it('reads the keeper update stamp and floors to whole days', () => {
    expect(R.scheduleAgeDays(mosque(daysAgo(3.9)))).toBe(3);
    expect(R.scheduleAgeDays(mosque(null))).toBeNull();
    expect(R.scheduleAgeDays({ effectiveTimings: { updatedAt: daysAgo(10) } })).toBe(10);
  });
});

describe('directory card freshness', () => {
  it('stays quiet for a schedule updated within 30 days', () => {
    const card = R.renderCard(mosque(daysAgo(12)));
    expect(card.querySelector('.card__fresh')).toBeNull();
  });

  it('shows a muted age line between 30 and 90 days', () => {
    const card = R.renderCard(mosque(daysAgo(45)));
    const line = card.querySelector('.card__fresh');
    expect(line).not.toBeNull();
    expect(line.classList.contains('card__fresh--stale')).toBe(false);
    expect(line.textContent).toBe('updated 45 days ago');
  });

  it('flags a schedule older than 90 days and tells the user to check first', () => {
    const card = R.renderCard(mosque(daysAgo(120)));
    const line = card.querySelector('.card__fresh');
    expect(line.classList.contains('card__fresh--stale')).toBe(true);
    expect(line.textContent).toMatch(/120 days ago/);
    expect(line.textContent).toMatch(/check before you go/);
  });

  it('shows nothing when the age is unknown', () => {
    expect(R.renderCard(mosque(undefined)).querySelector('.card__fresh')).toBeNull();
  });
});
