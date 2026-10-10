/**
 * Hero-card actions: the keeper row carries two equal buttons — photograph
 * the board, or type the times. Keeper credit lives in the detail drawer.
 */

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
if (!bodyMatch) throw new Error('index.html has no <body>');

describe('hero keeper-row actions', () => {
  beforeAll(() => {
    document.body.innerHTML = bodyMatch[1];
  });

  it('places both buttons inside #next-keeper-row with the expected ids, labels, and i18n keys', () => {
    const row = document.getElementById('next-keeper-row');
    expect(row).toBeTruthy();

    const scan = row.querySelector('#next-scan');
    const enter = row.querySelector('#next-enter');
    expect(scan).toBeTruthy();
    expect(enter).toBeTruthy();
    expect(scan.tagName).toBe('BUTTON');
    expect(enter.tagName).toBe('BUTTON');

    const scanLabel = scan.querySelector('[data-i18n="scan.takePic"]');
    const enterLabel = enter.querySelector('[data-i18n="scan.enterYourself"]');
    expect(scanLabel).toBeTruthy();
    expect(enterLabel).toBeTruthy();
    expect(scanLabel.textContent.trim()).toBe('Take a pic');
    expect(enterLabel.textContent.trim()).toBe('Enter the time yourself');

    expect(scan.getAttribute('data-i18n-aria-label')).toBe('scan.aria');
    expect(enter.getAttribute('data-i18n-aria-label')).toBe('scan.enterAria');
    expect(scan.getAttribute('aria-label')).toBe('Take a picture of the masjid timetable board');
    expect(enter.getAttribute('aria-label')).toBe("Type this masjid's jamat times yourself");

    const actions = row.querySelector('.next-card__actions');
    expect(actions).toBeTruthy();
    expect(actions.contains(scan)).toBe(true);
    expect(actions.contains(enter)).toBe(true);

    const keeper = row.querySelector('#next-keeper');
    expect(keeper).toBeNull();
  });
});
