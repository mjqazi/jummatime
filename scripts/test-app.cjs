const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('../app/node_modules/puppeteer');
const { createServer } = require('./serve.cjs');

const id = '736073a4-58f0-4f15-a137-d7b2b2763c71';
const mosque = {
  id, name: 'Central Masjid', city: 'Karachi', country: 'Pakistan',
  latitude: 24.8607, longitude: 67.0011, addressLine1: 'Main Road', status: 'active',
  effectiveTimings: { fajr: '05:00', dhuhr: '13:00', asr: '16:00', isha: '20:00',
    jummah: ['13:15', '14:00', '14:45'] }, amenities: [],
};
const found = { ...mosque, id: '093143ae-8d0c-4559-8f13-cc95beabac68', name: 'Search Result Masjid', city: 'Multan' };

async function run() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
  let browser;
  const artifacts = path.resolve(__dirname, '../.artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    browser = await puppeteer.launch({ headless: true, executablePath });
    for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['small-mobile', 320, 740]]) {
      const page = await browser.newPage();
      const errors = [];
      const missing = [];
      const writes = [];
      let searched = false;
      page.on('pageerror', err => errors.push(err.message));
      page.on('response', res => {
        if (res.url().startsWith(base) && res.status() >= 400) missing.push(res.url());
      });
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.evaluateOnNewDocument((id) => {
        if (!sessionStorage.getItem('test.initialized')) {
          localStorage.setItem('jamat.localDefaultMosqueId', id);
          sessionStorage.setItem('test.initialized', 'true');
        }
        localStorage.setItem('takbeer_keeper_intro_seen_v2', 'true');
        localStorage.setItem('jamat_onboarding_done', 'true');
        // Keep permission deterministic without prompting or scheduling real alerts.
        Object.defineProperty(window, 'Notification', { value: Object.assign(function () {}, {
          permission: 'granted', requestPermission: async () => 'granted',
        }), configurable: true });
      }, id);
      await page.setRequestInterception(true);
      page.on('request', async req => {
        if (!req.url().startsWith('https://takbeertime.com/api')) return req.continue();
        if (!['GET', 'OPTIONS'].includes(req.method())) {
          writes.push(req.method() + ' ' + req.url());
          return req.abort();
        }
        const url = new URL(req.url());
        const headers = { 'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type,authorization', 'content-type': 'application/json' };
        if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers });
        let body;
        if (url.pathname === '/api/mosques') {
          searched = !!url.searchParams.get('search');
          const entry = { ...(searched ? found : mosque) };
          delete entry.effectiveTimings;
          body = { data: [entry], pagination: { totalCount: 1 } };
        } else if (url.pathname === '/api/mosques/nearby') body = { data: [mosque], count: 1 };
        else if (url.pathname.endsWith('/submissions') || url.pathname.endsWith('/keepers')) body = { data: [] };
        else body = { ...(url.pathname.endsWith(found.id) ? found : mosque) };
        return req.respond({ status: 200, headers, body: JSON.stringify(body) });
      });
      await page.goto(base + '/app/', { waitUntil: 'networkidle2' });
      await page.waitForFunction(() => document.querySelector('#next-mosque')?.textContent.includes('Central'));
      await page.waitForFunction(() => document.querySelector('.card__jummah-time')?.textContent.includes('1:15'));
      const state = await page.evaluate(() => ({
        title: document.title,
        next: window.JAMAT_RENDER.computeNextJummah(window.JAMAT_RENDER.timingsFromMosque(window.__jamatView.defaultMosqueObj)),
        heading: document.querySelector('h1').textContent,
        canonical: document.querySelector('[rel=canonical]').href,
        analytics: typeof window.gtag,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        badImages: [...document.images].filter(img => img.getBoundingClientRect().height && (!img.complete || !img.naturalWidth)).map(img => img.src),
      }));
      assert(state.title.includes('JummaTime'));
      assert(state.heading.includes('Jummah'));
      assert(state.next.key.startsWith('jummah'));
      assert.equal(state.canonical, 'https://jummatime.com/app/');
      assert.equal(state.analytics, 'undefined');
      assert.equal(state.overflow, false, `${name}: horizontal overflow`);
      assert.deepEqual(state.badImages, []);
      await page.screenshot({ path: path.join(artifacts, `jumma-${name}.png`), fullPage: true });

      // Guest default selection remains local and returns home.
      await page.evaluate(() => localStorage.removeItem('jamat.localDefaultMosqueId'));
      await page.reload({ waitUntil: 'networkidle2' });
      assert.equal(await page.$eval('#keeper-intro-modal', el => el.getAttribute('aria-hidden')), 'true');
      await page.click('[data-set-default]');
      await page.waitForFunction(() => localStorage.getItem('jamat.localDefaultMosqueId'));
      assert.equal(await page.evaluate(() => location.hash), '');

      await page.click('#next-bell');
      const prefs = await page.evaluate(() => window.reminders.getPrefs());
      assert.equal(prefs.prayerEnabled.jummah, true);
      assert.equal(prefs.perPrayer.jummah, 10);
      assert.equal(prefs.prayerEnabled.fajr, false);
      assert.equal(await page.$eval('.daily-times', el => el.open), false);
      await page.click('.daily-times summary');
      assert.equal(await page.$eval('.daily-times', el => el.open), true);

      await page.type('#search', 'Multan');
      await page.waitForFunction(() => document.querySelector('.card__name')?.textContent.includes('Search Result'));
      await page.waitForFunction(() => window.__jamatView.searchResults?.[0]?.timingDetailsLoaded === true);
      assert(searched);
      await page.evaluate(() => {
        const input = document.querySelector('#search'); input.value = ''; input.dispatchEvent(new Event('input'));
      });
      await page.waitForFunction(() => document.querySelector('.card__name')?.textContent.includes('Central'));

      const missingFriday = await page.evaluate(() => {
        const R = window.JAMAT_RENDER;
        return R.computeNextJummah({ dhuhr: '13:00' });
      });
      assert.equal(missingFriday, null);
      await page.click('#lang-trigger');
      await page.click('#lang-option-ur');
      await page.waitForFunction(() => document.querySelector('.card__navigate')?.textContent.includes('راستہ'));
      assert.equal(await page.$eval('.card__jummah-label', el => el.textContent), 'جمعہ');
      await page.screenshot({ path: path.join(artifacts, `jumma-urdu-${name}.png`), fullPage: true });
      await page.click('#lang-trigger');
      await page.click('#lang-option-en');
      await page.waitForFunction(() => window.i18n.current() === 'en');
      assert.deepEqual(errors, [], `${name}: JS errors`);
      assert.deepEqual(missing, [], `${name}: missing local assets`);
      assert.deepEqual(writes, [], `${name}: production writes attempted`);
      console.log(`PASS ${name}: home, Friday countdown, guest default, reminders, search, assets`);
      await page.close();
    }
    const copy = require('../app/data/jumma-copy.json');
    const languagePage = await browser.newPage();
    await languagePage.evaluateOnNewDocument(() => {
      if (!sessionStorage.getItem('test.languages')) {
        localStorage.clear();
        sessionStorage.setItem('test.languages', 'true');
      }
    });
    const languageErrors = [];
    languagePage.on('pageerror', error => languageErrors.push(error.message));
    await languagePage.setViewport({ width: 320, height: 740 });
    await languagePage.setRequestInterception(true);
    languagePage.on('request', req => {
      if (!req.url().startsWith('https://takbeertime.com/api')) return req.continue();
      return req.respond({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify({ data: [], pagination: { totalCount: 0 } }) });
    });
    for (const lang of Object.keys(copy)) {
      const route = lang === 'en' ? '/' : `/${lang}/`;
      await languagePage.goto(base + route + `?lang=${lang}`, { waitUntil: 'networkidle2' });
      await languagePage.waitForFunction(lang => window.i18n?.current() === lang && document.title.startsWith('JummaTime'), {}, lang);
      assert.equal(await languagePage.$eval('h1', el => el.textContent), copy[lang]['hero.headlineHtml']);
      assert.equal(await languagePage.$eval('#search', el => el.placeholder), copy[lang]['dir.searchPh']);
      assert.equal(await languagePage.$eval('html', el => el.dir), ['ur', 'ar', 'fa'].includes(lang) ? 'rtl' : 'ltr');
      assert.equal(await languagePage.$eval('[rel=canonical]', el => el.href), 'https://jummatime.com' + route);
      assert.equal(await languagePage.$$eval('link[rel="alternate"][hreflang]', elements => elements.length), 11);
      assert.equal(await languagePage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${lang}: overflow`);
      assert.equal(await languagePage.evaluate(() => typeof window.gtag), 'undefined');
      assert.equal(await languagePage.$eval('#next-card', el => el.hidden), true);
      assert.equal(await languagePage.$eval('#keeper-intro-modal', el => el.getAttribute('aria-hidden')), 'true');
      assert.equal(await languagePage.evaluate(() => window.JAMAT_CONFIG.apiBase), 'https://takbeertime.com/api');
      await languagePage.screenshot({ path: path.join(artifacts, `jumma-language-${lang}.png`), fullPage: true });
      console.log(`PASS ${lang}: localized homepage, core copy, direction, narrow viewport`);
    }
    await languagePage.goto(base + '/', { waitUntil: 'networkidle2' });
    await languagePage.click('#lang-trigger');
    await languagePage.click('#lang-option-ur');
    await languagePage.waitForFunction(() => window.i18n.current() === 'ur');
    await languagePage.reload({ waitUntil: 'networkidle2' });
    assert.equal(await languagePage.evaluate(() => window.i18n.current()), 'ur');
    await languagePage.goto(base + '/fr/', { waitUntil: 'networkidle2' });
    assert.equal(await languagePage.evaluate(() => window.i18n.current()), 'fr');
    await languagePage.click('#lang-trigger');
    await languagePage.click('#lang-option-ar');
    await languagePage.waitForFunction(() => window.i18n.current() === 'ar');
    await languagePage.reload({ waitUntil: 'networkidle2' });
    assert.equal(await languagePage.evaluate(() => window.i18n.current()), 'ar');
    assert.deepEqual(languageErrors, []);
    await languagePage.close();
    const page = await browser.newPage();
    await page.goto(base + '/app/?q=Multan', { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.querySelector('#search')?.value === 'Multan');
    assert.equal(await page.evaluate(() => window.JAMAT_CONFIG.devAuthEnabled), false);
    await page.close();
    console.log('PASS discovery query and production auth guard');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(err => { console.error(err); process.exitCode = 1; });
