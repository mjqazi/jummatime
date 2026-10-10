const fs = require('node:fs');
const path = require('node:path');
const copy = require('../../data/jumma-copy.json');
const source = fs.readFileSync(path.join(__dirname, '../i18n.js'), 'utf8');

describe('Generated language homepages', () => {
  test.each(Object.keys(copy))('%s has localized static copy and shared app assets', lang => {
    const route = lang === 'en' ? '/' : `/${lang}/`;
    const file = path.resolve(__dirname, '../../..', lang === 'en' ? 'index.html' : `${lang}/index.html`);
    const doc = new DOMParser().parseFromString(fs.readFileSync(file, 'utf8'), 'text/html');
    expect(doc.querySelector('h1').textContent).toBe(copy[lang]['hero.headlineHtml']);
    expect(doc.querySelector('#search').placeholder).toBe(copy[lang]['dir.searchPh']);
    expect(doc.querySelector('#login-create-account').textContent).toBe(copy[lang]['login.createAccount']);
    expect(doc.documentElement.lang).toBe(lang);
    expect(doc.querySelector('[rel=canonical]').href).toBe('https://jummatime.com' + route);
    expect(doc.querySelectorAll('link[hreflang]')).toHaveLength(11);
    expect(doc.querySelector('script[src*="config.js"]').src).toContain('/app/js/config.js');
    expect(doc.querySelector('link[href*="jumma.css"]').href).toContain('/app/css/jumma.css');
    const schema = JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent);
    expect(schema['@graph'].find(node => node['@type'] === 'WebPage').inLanguage).toBe(lang);
  });
});

describe('JummaTime languages', () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState({}, '', '/');
    document.documentElement.removeAttribute('data-app-language');
    document.body.innerHTML = '<h1 data-i18n="hero.headlineHtml:html"></h1><input data-i18n-placeholder="dir.searchPh">';
    global.fetch = jest.fn(async url => ({ ok: true, json: async () => {
      if (url.includes('jumma-copy.json')) return copy;
      const code = /\/([a-z]{2})\.json/.exec(url)[1];
      return require(`../../i18n/${code}.json`);
    } }));
    window.eval(source);
  });
  afterEach(() => { delete window.i18n; delete global.fetch; });

  test.each(Object.keys(copy))('%s has complete core copy and renders its direction', async lang => {
    expect(Object.keys(copy[lang]).sort()).toEqual(Object.keys(copy.en).sort());
    document.documentElement.dataset.appLanguage = lang;
    await window.i18n.init();
    expect(document.querySelector('h1').textContent).toBe(copy[lang]['hero.headlineHtml']);
    expect(document.querySelector('input').placeholder).toBe(copy[lang]['dir.searchPh']);
    expect(document.documentElement.dir).toBe(['ur', 'ar', 'fa'].includes(lang) ? 'rtl' : 'ltr');
    expect(document.title).toBe(copy[lang]['app.pageTitle']);
    if (lang !== 'en') expect(copy[lang]['hero.headlineHtml']).not.toBe(copy.en['hero.headlineHtml']);
  });

  test('explicit URL and localized route beat the stored language', async () => {
    localStorage.setItem('jamat.lang', 'fr');
    document.documentElement.dataset.appLanguage = 'ur';
    await window.i18n.init();
    expect(window.i18n.current()).toBe('ur');
    history.replaceState({}, '', '/?lang=ar');
    await window.i18n.init();
    expect(window.i18n.current()).toBe('ar');
  });

  test('language choice is saved and the shared copy is fetched once', async () => {
    await window.i18n.set('ur');
    await window.i18n.set('fr');
    expect(localStorage.getItem('jamat.lang')).toBe('fr');
    expect(fetch.mock.calls.filter(([url]) => url.includes('jumma-copy.json'))).toHaveLength(1);
    expect(fetch.mock.calls.every(([url]) => url.startsWith('/app/'))).toBe(true);
  });

  test('switching from a localized route survives reinitialization', async () => {
    document.documentElement.dataset.appLanguage = 'ur';
    history.replaceState({}, '', '/ur/?q=Lahore#masjids');
    await window.i18n.set('fr');
    await window.i18n.init();
    expect(window.i18n.current()).toBe('fr');
    expect(new URL(location.href).searchParams.get('q')).toBe('Lahore');
    expect(location.hash).toBe('#masjids');
  });
});
