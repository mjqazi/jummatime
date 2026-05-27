#!/usr/bin/env node
/* Jumma Time static build.
   - Generates /jumma-time/<slug>.html from data/cities.json
   - Injects the city grid + footer city list into pages that carry the markers
   - Regenerates sitemap.xml
   Run: node scripts/build.js   (no dependencies) */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://jummatime.com';
const PLAY = 'https://play.google.com/store/apps/details?id=com.takbeertime.android';
const WEBAPP = 'https://takbeertime.com/';
const BRAND = 'Jumma Time';
const ORG_ID = `${SITE}/#organization`;
const WEBSITE_ID = `${SITE}/#website`;
const ICON = `${SITE}/assets/brand/jummatime-icon-512.png`;
const OG_IMAGE = `${SITE}/assets/brand/jummatime-og.png`;
const GA_MEASUREMENT_ID = 'G-W9QBC0PLVN';

const curatedCities = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
const priorityCitiesPath = path.join(ROOT, 'data', 'priority-cities.json');
const priorityCities = fs.existsSync(priorityCitiesPath)
  ? JSON.parse(fs.readFileSync(priorityCitiesPath, 'utf8'))
  : [];
const translatedLocales = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'locales.json'), 'utf8'));
const EN_LOCALE = {
  code: 'en',
  name: 'English',
  localName: 'English',
  dir: 'ltr',
  navNear: 'Jummah near me',
  navWhat: 'What time is Jummah',
  navTravel: 'Traveling',
  navMasjids: 'For masjids',
  getApp: 'Get the app',
  installApp: 'Install the free app',
  useWebApp: 'Use the web app',
  findButton: 'Find masjids near me',
  nextLabel: 'Next Jummah',
  thisFriday: 'This Friday',
  unitDays: 'days',
  unitHours: 'hrs',
  unitMinutes: 'min',
  unitSeconds: 'sec',
  statusOpening: 'Opening the masjid finder...',
  statusFinding: 'Finding masjids near you...',
  statusLocationOff: 'Location off — opening the masjid finder anyway.',
  skipLink: 'Skip to content',
  primaryNavLabel: 'Primary',
  homeAria: 'Jumma Time home',
  widgetNote: 'Countdown is to Friday midday — exact jamat time is set by each masjid.',
  footerFind: 'Find Jummah',
  footerCities: 'Cities',
  footerApp: 'App',
  footerText: 'Find Jumma and Jummah prayer times at the nearest masjid. Powered by the Takbeer Time community.',
  legal: 'A community project — free, no ads. Jumma and Jummah times are community-posted; always confirm with your local masjid.',
  quickAnswer: 'Quick answer',
  cityGridTitle: 'Jummah time by city',
  checkMasjids: 'Check masjids',
  bodyTitle: 'Why the exact masjid time matters',
  body: 'A map tells you where a masjid is, but not always when the khutbah starts. Jummah times move with Dhuhr, differ between masjids, and larger masjids may run more than one congregation.',
  cityTitle: 'Jumma / Jummah Time in {city}: Friday Prayer at Masjids | Jumma Time',
  cityDesc: 'Find Jumma and Jummah prayer times in {city}. Check nearby masjids, multiple Friday prayer sessions, and current jamat times.',
  cityH1: 'Jumma / Jummah time in {city}',
  cityLead: 'Need Jummah in {city} this Friday? Compare nearby masjids and community-posted Jumma and Jummah times.',
  cityQuick: 'Jumma in {city}, also spelled Jummah, is not one fixed city-wide time. Each masjid sets its own jamat time.',
  cityBody: '{city} is an important city for travel, work, and study. Use a masjid-level Jummah time rather than a generic estimate.',
  cityCheckTitle: 'How to check Jummah times in {city}',
  cityCheckBody: 'We do not have a source-verified masjid timetable on this page yet. Use Takbeer Time to compare nearby masjids and confirm before you leave.',
  citySourceNote: 'If you manage a masjid in {city}, publish its official Jummah time with a source link so it can be shown here.',
  cityFaqTitle: 'Jummah in {city} — quick answers',
  cityFaqQ1: 'What time is Jummah in {city}?',
  cityFaqA1: 'Jummah is prayed after midday on Friday, but the exact jamat time is set by each masjid.',
  cityFaqQ2: 'How do I find a masjid for Jummah in {city}?',
  cityFaqA2: 'Open Takbeer Time and allow location access to see nearby masjids with community-posted Jummah times.',
  cityMoreTitle: 'Jummah time in other cities'
};
const LOCALES = [EN_LOCALE].concat(translatedLocales);

const COUNTRY_CODES = {
  Afghanistan: 'AF',
  Algeria: 'DZ',
  Argentina: 'AR',
  Australia: 'AU',
  Austria: 'AT',
  Bahrain: 'BH',
  Bangladesh: 'BD',
  Belgium: 'BE',
  Brazil: 'BR',
  'Burkina Faso': 'BF',
  Cambodia: 'KH',
  Canada: 'CA',
  Chad: 'TD',
  Chile: 'CL',
  China: 'CN',
  Colombia: 'CO',
  "Cote d'Ivoire": 'CI',
  Denmark: 'DK',
  Djibouti: 'DJ',
  Ecuador: 'EC',
  Egypt: 'EG',
  Ethiopia: 'ET',
  France: 'FR',
  Germany: 'DE',
  Ghana: 'GH',
  Greece: 'GR',
  Guinea: 'GN',
  India: 'IN',
  Indonesia: 'ID',
  Iran: 'IR',
  Iraq: 'IQ',
  Italy: 'IT',
  Japan: 'JP',
  Jordan: 'JO',
  Kenya: 'KE',
  Kuwait: 'KW',
  Lebanon: 'LB',
  Libya: 'LY',
  Malaysia: 'MY',
  Maldives: 'MV',
  Mali: 'ML',
  Mauritania: 'MR',
  Mexico: 'MX',
  Morocco: 'MA',
  Myanmar: 'MM',
  Netherlands: 'NL',
  'New Zealand': 'NZ',
  Niger: 'NE',
  Nigeria: 'NG',
  Norway: 'NO',
  Oman: 'OM',
  Pakistan: 'PK',
  Palestine: 'PS',
  Panama: 'PA',
  Peru: 'PE',
  Philippines: 'PH',
  Poland: 'PL',
  Qatar: 'QA',
  Russia: 'RU',
  Rwanda: 'RW',
  'Saudi Arabia': 'SA',
  Senegal: 'SN',
  'Sierra Leone': 'SL',
  Singapore: 'SG',
  Somalia: 'SO',
  'South Africa': 'ZA',
  'South Korea': 'KR',
  Spain: 'ES',
  'Sri Lanka': 'LK',
  Sudan: 'SD',
  Sweden: 'SE',
  Switzerland: 'CH',
  Syria: 'SY',
  Taiwan: 'TW',
  Tanzania: 'TZ',
  Thailand: 'TH',
  'The Gambia': 'GM',
  Tunisia: 'TN',
  Turkiye: 'TR',
  Uganda: 'UG',
  Ukraine: 'UA',
  'United Arab Emirates': 'AE',
  'United Kingdom': 'GB',
  'United States': 'US',
  Venezuela: 'VE',
  Vietnam: 'VN',
  Yemen: 'YE'
};

const COUNTRY_NAME_OVERRIDES = {
  ar: {
    Somaliland: 'صوماليلاند'
  },
  bn: {
    Somaliland: 'সোমালিল্যান্ড'
  },
  fa: {
    Somaliland: 'سومالی‌لند'
  },
  hi: {
    Somaliland: 'सोमालीलैंड'
  },
  tr: {
    Somaliland: 'Somaliland'
  },
  ur: {
    Somaliland: 'صومالی لینڈ',
    'United Kingdom': 'برطانیہ',
    'United States': 'امریکہ'
  }
};

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function slugify(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeCity(c) {
  return Object.assign(
    {
      slug: slugify(c.name),
      timezone: 'local time',
      group: 'global',
      masjids: []
    },
    c
  );
}

function combineCities(primary, expanded) {
  const seen = new Set();
  const counts = new Map();
  return primary.concat(expanded).map(normalizeCity).filter((city, index) => {
    const key = city.slug;
    if (seen.has(key)) return false;
    if (index >= primary.length && (counts.get(city.country) || 0) >= 4) return false;
    seen.add(key);
    counts.set(city.country, (counts.get(city.country) || 0) + 1);
    return true;
  });
}

const cities = combineCities(curatedCities, priorityCities);

/* Merge in real Jummah times fetched from the Takbeer Time API
   (scripts/fetch-masjid-times.js -> data/city-masjid-times.json).
   When a city has fetched times they replace the curated name list,
   so the city page renders an actual times table instead of a stub. */
(() => {
  const p = path.join(ROOT, 'data', 'city-masjid-times.json');
  if (!fs.existsSync(p)) return;
  const times = JSON.parse(fs.readFileSync(p, 'utf8'));
  let merged = 0;
  for (const city of cities) {
    if (Array.isArray(times[city.slug]) && times[city.slug].length) {
      city.masjids = times[city.slug];
      merged++;
    }
  }
  console.log(`  merged real Jummah times into ${merged} cities`);
})();

const TOP_PAGE_PATHS = {
  home: '/',
  near: '/jumma-near-me.html',
  what: '/what-time-is-jumma.html',
  travel: '/jumma-while-traveling.html',
  masjid: '/jumma-in-masjid.html',
  forMasjids: '/for-masjids.html'
};

const LOCALIZED_PAGE_KEYS = ['home', 'near', 'what', 'travel', 'masjid', 'forMasjids'];

function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (vars[key] == null ? '' : vars[key]));
}

function localizedCountryName(country, locale) {
  if (!locale || locale.code === 'en') return country;
  const override = COUNTRY_NAME_OVERRIDES[locale.code] && COUNTRY_NAME_OVERRIDES[locale.code][country];
  if (override) return override;
  const region = COUNTRY_CODES[country];
  if (!region || typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') return country;
  try {
    return new Intl.DisplayNames([locale.code], { type: 'region' }).of(region) || country;
  } catch (_) {
    return country;
  }
}

function cityVars(city, locale) {
  return {
    city: city.name,
    country: localizedCountryName(city.country, locale)
  };
}

function localizedPath(locale, englishPath) {
  if (locale.code === 'en') return englishPath;
  return englishPath === '/' ? `/${locale.code}/` : `/${locale.code}${englishPath}`;
}

function absoluteUrl(localPath) {
  return `${SITE}${localPath}`;
}

function topPath(pageKey, locale) {
  return localizedPath(locale, TOP_PAGE_PATHS[pageKey]);
}

function cityPath(city, locale) {
  return localizedPath(locale, `/jumma-time/${city.slug}.html`);
}

function topAlternates(pageKey) {
  const englishHref = absoluteUrl(topPath(pageKey, EN_LOCALE));
  return LOCALES.map((locale) => ({
    hreflang: locale.code,
    href: absoluteUrl(topPath(pageKey, locale))
  })).concat([{ hreflang: 'x-default', href: englishHref }]);
}

function cityAlternates(city) {
  const englishHref = absoluteUrl(cityPath(city, EN_LOCALE));
  return LOCALES.map((locale) => ({
    hreflang: locale.code,
    href: absoluteUrl(cityPath(city, locale))
  })).concat([{ hreflang: 'x-default', href: englishHref }]);
}

function localFilePath(localPath) {
  const clean = localPath === '/' ? 'index.html' : localPath.replace(/^\//, '');
  return path.join(ROOT, clean.endsWith('/') ? `${clean}index.html` : clean);
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function fileDate(relPath) {
  const p = path.join(ROOT, relPath);
  if (!fs.existsSync(p)) return new Date().toISOString().slice(0, 10);
  return new Date(fs.statSync(p).mtimeMs).toISOString().slice(0, 10);
}

function writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) return false;
  fs.writeFileSync(filePath, content);
  return true;
}

function organizationNode() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: BRAND,
    url: `${SITE}/`,
    logo: {
      '@type': 'ImageObject',
      url: ICON,
      width: 512,
      height: 512
    },
    sameAs: [WEBAPP, PLAY]
  };
}

function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${SITE}/`,
    name: BRAND,
    alternateName: ['JummaTime', 'Jummah Time', 'Juma Time', 'Find Jumma Near Me', 'Find Jummah Near Me'],
    description: 'Find community-posted Jumma, Jummah, and Friday prayer times at nearby masjids.',
    inLanguage: 'en',
    publisher: { '@id': ORG_ID }
  };
}

function appNode() {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${SITE}/#app`,
    name: 'Takbeer Time',
    operatingSystem: 'Android',
    applicationCategory: 'LifestyleApplication',
    url: PLAY,
    description:
      'Takbeer Time helps travelers and local worshippers find nearby masjids with community-posted Jumma, Jummah, jamat, jamaat, and iqamah times.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
  };
}

function imageNode(id) {
  return {
    '@type': 'ImageObject',
    '@id': id,
    url: OG_IMAGE,
    width: 1200,
    height: 630,
    caption: 'Jumma Time helps travelers find Friday prayer times at nearby masjids.'
  };
}

function jsonld(nodes) {
  return {
    '@context': 'https://schema.org',
    '@graph': [organizationNode(), websiteNode(), appNode()].concat(nodes)
  };
}

function masjidName(m) {
  return typeof m === 'string' ? m : m.name;
}

function masjidTimeText(m) {
  if (typeof m === 'string' || !Array.isArray(m.jummahTimes) || m.jummahTimes.length === 0) {
    return '';
  }
  return m.jummahTimes.join(', ');
}

function verifiedMasjids(c) {
  return c.masjids.filter((m) => typeof m !== 'string' && masjidTimeText(m) && m.sourceUrl);
}

function masjidTimesTable(c, verified) {
  const rows = verified
    .map(
      (m) => `<tr>
            <th scope="row">${esc(m.name)}</th>
            <td>${esc(masjidTimeText(m))}</td>
            <td><a href="${esc(m.sourceUrl)}" target="_blank" rel="noopener">${esc(m.sourceLabel || 'Takbeer Time')}</a>${m.lastChecked ? ` <span class="source-note">checked ${esc(m.lastChecked)}</span>` : ''}</td>
          </tr>`
    )
    .join('\n          ');
  return `<div class="time-table-wrap">
          <table class="time-table">
            <thead>
              <tr>
                <th scope="col">Masjid</th>
                <th scope="col">Jummah time</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
          ${rows}
            </tbody>
          </table>
        </div>`;
}

function cityMasjidSection(c) {
  const verified = verifiedMasjids(c);
  if (verified.length > 0) {
    return `<h2>Jummah times at masjids in ${esc(c.name)}</h2>
        <p>These Jummah times are posted by the local community in <strong>Takbeer Time</strong>. They are a
        starting point, not a guarantee — schedules shift with the season and for holidays, so confirm with the
        masjid before you set out. Open the app to see every masjid near your exact location, with reminders.</p>
        ${masjidTimesTable(c, verified)}
        <p class="source-note">
          Times last checked ${esc(verified[0].lastChecked || fileDate('data/city-masjid-times.json'))}.
          Run a masjid in ${esc(c.name)}? Keep your Jummah time accurate for everyone by updating it in Takbeer Time.
        </p>`;
  }

  const masjidList = c.masjids.map((m) => `<li>${esc(masjidName(m))}</li>`).join('\n            ');
  if (!masjidList) {
    return `<h2>Find Jummah in ${esc(c.name)} with Takbeer Time</h2>
        <p>
          <strong>Takbeer Time</strong> is built for exactly this moment. Open the free app, allow location,
          and see masjids around you in ${esc(c.name)} with Jummah and jamat times posted by the people who
          actually pray there — plus reminders so you reach the masjid before the khutbah and first takbeer.
        </p>
        <p class="source-note">
          Run a masjid in ${esc(c.name)}? Publish your official Jummah time in Takbeer Time so every traveler
          and new resident sees the correct time.
        </p>`;
  }

  return `<h2>Masjids to check in ${esc(c.name)} — and the fastest way to confirm</h2>
        <p>
          These well-known masjids are a starting point. For the exact, current Jummah time — and every other
          masjid near you — open <strong>Takbeer Time</strong>: it shows community-posted Jummah and jamat times
          for masjids across ${esc(c.name)}, with reminders so you never miss the first takbeer.
        </p>
        <ul>
            ${masjidList}
        </ul>
        <p class="source-note">
          Run one of these masjids? Publish your official Jummah time in Takbeer Time and keep your community
          and every visitor on time.
        </p>`;
}

const groupCopy = {
  global: {
    blurb: (c) =>
      `${c.name} is one of the world's major urban centers, with Friday travel, work, study, and airport schedules often making Jummah planning time-sensitive. Masjid times can vary by neighborhood and season, so check a masjid-level Jummah time before setting out.`,
    tip: (c) =>
      `In a large city like ${c.name}, choose a masjid close to where you will actually be at khutbah time, not just the first search result across town.`
  },
  'muslim-majority': {
    blurb: (c) =>
      `${c.name} is a major city in a Muslim-majority country, so Jummah options are usually widespread across central districts, residential neighborhoods, universities, and transport corridors. The important detail is still the specific masjid's session time, especially where large mosques run more than one congregation.`,
    tip: (c) =>
      `Expect busy crowds around central masjids in ${c.name}; check the session time early and give yourself extra time before the khutbah.`
  },
  gulf: {
    blurb: (c) =>
      `${c.name} is a Gulf travel and work hub where Jummah is often planned around office schedules, malls, hotels, and fast-moving traffic. Friday prayer may be easy to find, but the exact start time still differs by masjid and area.`,
    tip: (c) =>
      `If you are visiting ${c.name} for work or transit, pick a masjid near your hotel, office, or terminal before Friday traffic builds.`
  },
  'south-asia': {
    blurb: (c) =>
      `${c.name} has a large Muslim community and many Friday prayer options across dense neighborhoods, markets, campuses, and transport hubs. Crowds can be heavy, and nearby masjids may hold different Jummah session times.`,
    tip: (c) =>
      `For ${c.name}, check the masjid's own Jummah session and leave early; short distances can still take time around Friday crowds.`
  },
  'southeast-asia': {
    blurb: (c) =>
      `${c.name} is a major Southeast Asian city where Jummah may be listed as Jummah, Jumu'ah, or Jumaat depending on local usage. Large mosques and central musallas can fill quickly, so masjid-level timing matters.`,
    tip: (c) =>
      `Search both Jummah and Jumaat when checking local notices in ${c.name}, then confirm the exact masjid time before setting out.`
  },
  africa: {
    blurb: (c) =>
      `${c.name} is a major African city with Jummah options spread across central districts, markets, universities, and residential areas. Friday prayer times can differ between nearby masjids, especially where communities hold multiple sessions.`,
    tip: (c) =>
      `In ${c.name}, choose a masjid by both time and route; traffic and neighborhood distance can matter as much as the listed start time.`
  },
  europe: {
    blurb: (c) =>
      `${c.name} has Muslim communities spread across the city and surrounding suburbs, so Jummah may be held in purpose-built masjids, Islamic centres, rented halls, or campus prayer spaces. Multiple Friday sessions are common in busy areas.`,
    tip: (c) =>
      `In ${c.name}, do not rely on a generic prayer timetable alone; verify the specific masjid or Islamic centre's Jummah session.`
  },
  'north-america': {
    blurb: (c) =>
      `${c.name} has Jummah options across city centers, suburbs, universities, and workplace musallas. Because commutes can be long and masjids often run multiple sessions, the exact jamat time matters more than the nearest pin on a map.`,
    tip: (c) =>
      `For ${c.name}, compare both drive time and session time so you do not arrive after the khutbah has started.`
  },
  'east-asia': {
    blurb: (c) =>
      `${c.name} is a major destination for work, study, tourism, and transit, with Jummah options often concentrated around central mosques, embassies, universities, and international neighborhoods.`,
    tip: (c) =>
      `In ${c.name}, check Jummah before Friday morning if possible; options may be fewer and farther apart than in Muslim-majority cities.`
  },
  'latin-america': {
    blurb: (c) =>
      `${c.name} has Muslim communities and Islamic centres that serve locals, students, business travelers, and visitors. Jummah options may be more spread out than in Muslim-majority cities, so planning ahead matters.`,
    tip: (c) =>
      `For ${c.name}, confirm both the masjid location and Jummah start time before you travel across the city.`
  }
};

function cityBlurb(c) {
  if (c.blurb) return c.blurb;
  return (groupCopy[c.group] || groupCopy.global).blurb(c);
}

function cityTip(c) {
  if (c.tip) return c.tip;
  return (groupCopy[c.group] || groupCopy.global).tip(c);
}

function ogLocale(lang) {
  return (
    {
      en: 'en_US',
      ar: 'ar_AR',
      bn: 'bn_BD',
      fa: 'fa_IR',
      fr: 'fr_FR',
      hi: 'hi_IN',
      id: 'id_ID',
      ms: 'ms_MY',
      tr: 'tr_TR',
      ur: 'ur_PK'
    }[lang] || 'en_US'
  );
}

/* ---------- shared fragments ---------- */
function googleAnalyticsTag() {
  return `  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', '${GA_MEASUREMENT_ID}');
  </script>`;
}

function head(opts) {
  const lang = opts.lang || 'en';
  const dir = opts.dir ? ` dir="${opts.dir}"` : '';
  const alternates =
    opts.alternates ||
    [
      { hreflang: 'en', href: opts.url },
      { hreflang: 'x-default', href: opts.url }
    ];
  const alternateLinks = alternates
    .map((a) => `  <link rel="alternate" hreflang="${a.hreflang}" href="${a.href}" />`)
    .join('\n');
  return `<!doctype html>
<html lang="${lang}"${dir}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0F2A1E" />
  <title>${esc(opts.title)}</title>
  <meta name="description" content="${esc(opts.description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <meta name="author" content="${BRAND}" />
  <link rel="canonical" href="${opts.url}" />
${alternateLinks}
  <link rel="icon" type="image/png" sizes="512x512" href="/assets/brand/jummatime-icon-512.png" />
  <link rel="apple-touch-icon" href="/assets/brand/jummatime-icon-512.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta name="application-name" content="Jumma Time" />
  <meta name="google-play-app" content="app-id=com.takbeertime.android" />
  <meta property="og:locale" content="${ogLocale(lang)}" />
  <meta property="og:type" content="${opts.ogType || 'website'}" />
  <meta property="og:site_name" content="${BRAND}" />
  <meta property="og:title" content="${esc(opts.title)}" />
  <meta property="og:description" content="${esc(opts.description)}" />
  <meta property="og:url" content="${opts.url}" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta property="og:image:secure_url" content="${OG_IMAGE}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Jumma Time helps travelers find Friday prayer times at nearby masjids." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(opts.title)}" />
  <meta name="twitter:description" content="${esc(opts.description)}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />
  <meta name="twitter:image:alt" content="Jumma Time helps travelers find Friday prayer times at nearby masjids." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,400;1,500&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/jummatime.css" />
  <script src="/js/jummatime.js" defer></script>
${googleAnalyticsTag()}
  <script type="application/ld+json">
${JSON.stringify(opts.jsonld, null, 2)}
  </script>
</head>`;
}

const HEADER = `<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="site-header__in">
      <a class="brand" href="/" aria-label="Jumma Time home">
        <span class="brand__mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="28" height="28">
            <path d="M16 2.5c1.6 1.3 2.2 3 1.4 4.6-.7 1.4-.5 2.2.3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M7 28V17c0-5 4-8 9-8s9 3 9 8v11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            <circle cx="16" cy="18" r="3.4" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M16 16.2v1.8l1.3 1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <line x1="4" y1="28" x2="28" y2="28" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <line x1="5" y1="28" x2="5" y2="16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <line x1="27" y1="28" x2="27" y2="16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="brand__name">Jumma Time</span>
      </a>
      <nav class="site-nav" aria-label="Primary">
        <a href="/jumma-near-me.html">Jummah near me</a>
        <a href="/what-time-is-jumma.html">What time is Jummah</a>
        <a href="/jumma-while-traveling.html">Traveling</a>
        <a href="/for-masjids.html">For masjids</a>
        <a class="site-nav__cta" href="${PLAY}" data-play="nav" target="_blank" rel="noopener">Get the app</a>
      </nav>
    </div>
  </header>`;

function widget() {
  return `<aside class="jw" data-jummah-widget aria-label="Next Jummah countdown and masjid finder">
          <span class="jw__label">Next Jummah</span>
          <p class="jw__date" data-jw-date>This Friday</p>
          <div class="jw__clock" role="timer" aria-live="off">
            <span class="jw__unit"><span class="jw__num" data-jw="days">0</span><span class="jw__cap">days</span></span>
            <span class="jw__unit"><span class="jw__num" data-jw="hours">00</span><span class="jw__cap">hrs</span></span>
            <span class="jw__unit"><span class="jw__num" data-jw="mins">00</span><span class="jw__cap">min</span></span>
            <span class="jw__unit"><span class="jw__num" data-jw="secs">00</span><span class="jw__cap">sec</span></span>
          </div>
          <button class="btn btn--brass" type="button" data-jw-geo>Find masjids near me</button>
          <p class="jw__geo-status" data-jw-status></p>
          <p class="jw__note">Countdown is to Friday midday — exact jamat time is set by each masjid. Confirm it in the app.</p>
        </aside>`;
}

function footer() {
  return `  <footer class="site-footer">
    <div class="wrap site-footer__grid">
      <div>
        <a class="brand" href="/" aria-label="Jumma Time home">
          <span class="brand__name">Jumma Time</span>
        </a>
        <p style="font-size:0.9rem;max-width:34ch;margin-top:0.4rem">
          Find Friday prayer times at the nearest masjid. Powered by the Takbeer Time community.
        </p>
      </div>
      <div>
        <h4>Find Jummah</h4>
        <a href="/jumma-near-me.html">Jummah near me</a>
        <a href="/what-time-is-jumma.html">What time is Jummah</a>
        <a href="/jumma-while-traveling.html">Jummah while traveling</a>
        <a href="/jumma-in-masjid.html">Jummah in the masjid</a>
      </div>
      <div>
        <h4>Cities</h4>
        <div id="footer-cities"><!--FOOTERCITIES--><!--/FOOTERCITIES--></div>
      </div>
      <div>
        <h4>App</h4>
        <a href="${PLAY}" data-play="footer-link" target="_blank" rel="noopener">Install on Android</a>
        <a href="${WEBAPP}" target="_blank" rel="noopener">Use the web app</a>
        <a href="/for-masjids.html">For masjids &amp; timekeepers</a>
      </div>
    </div>
    <div class="wrap site-footer__legal">
      <p>&copy; 2026 Jumma Time. A community project — free, no ads, sadaqah fi sabilillah. Jumma times are community-posted; always confirm with your local masjid.</p>
    </div>
  </footer>
</body>
</html>`;
}

function localizedHeader(locale, activeKey) {
  const nav = [
    ['near', locale.navNear],
    ['what', locale.navWhat],
    ['travel', locale.navTravel],
    ['forMasjids', locale.navMasjids]
  ]
    .map(([key, label]) => `<a href="${topPath(key, locale)}"${activeKey === key ? ' aria-current="page"' : ''}>${esc(label)}</a>`)
    .join('\n        ');

  return `<body>
  <a class="skip-link" href="#main">${esc(locale.skipLink || EN_LOCALE.skipLink)}</a>
  <header class="site-header">
    <div class="site-header__in">
      <a class="brand" href="${topPath('home', locale)}" aria-label="${esc(locale.homeAria || EN_LOCALE.homeAria)}">
        <span class="brand__mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="28" height="28">
            <path d="M16 2.5c1.6 1.3 2.2 3 1.4 4.6-.7 1.4-.5 2.2.3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M7 28V17c0-5 4-8 9-8s9 3 9 8v11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            <circle cx="16" cy="18" r="3.4" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M16 16.2v1.8l1.3 1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <line x1="4" y1="28" x2="28" y2="28" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <line x1="5" y1="28" x2="5" y2="16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <line x1="27" y1="28" x2="27" y2="16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="brand__name">Jumma Time</span>
      </a>
      <nav class="site-nav" aria-label="${esc(locale.primaryNavLabel || EN_LOCALE.primaryNavLabel)}">
        ${nav}
        <a class="site-nav__cta" href="${PLAY}" data-play="nav-${locale.code}" target="_blank" rel="noopener">${esc(locale.getApp)}</a>
      </nav>
    </div>
  </header>`;
}

function localizedWidget(locale) {
  return `<aside class="jw" data-jummah-widget data-jw-locale="${esc(locale.code)}" data-jw-status-opening="${esc(locale.statusOpening || EN_LOCALE.statusOpening)}" data-jw-status-finding="${esc(locale.statusFinding || EN_LOCALE.statusFinding)}" data-jw-status-location-off="${esc(locale.statusLocationOff || EN_LOCALE.statusLocationOff)}" aria-label="${esc(locale.nextLabel)}">
          <span class="jw__label">${esc(locale.nextLabel)}</span>
          <p class="jw__date" data-jw-date>${esc(locale.thisFriday || EN_LOCALE.thisFriday)}</p>
          <div class="jw__clock" role="timer" aria-live="off">
            <span class="jw__unit"><span class="jw__num" data-jw="days">0</span><span class="jw__cap">${esc(locale.unitDays || EN_LOCALE.unitDays)}</span></span>
            <span class="jw__unit"><span class="jw__num" data-jw="hours">00</span><span class="jw__cap">${esc(locale.unitHours || EN_LOCALE.unitHours)}</span></span>
            <span class="jw__unit"><span class="jw__num" data-jw="mins">00</span><span class="jw__cap">${esc(locale.unitMinutes || EN_LOCALE.unitMinutes)}</span></span>
            <span class="jw__unit"><span class="jw__num" data-jw="secs">00</span><span class="jw__cap">${esc(locale.unitSeconds || EN_LOCALE.unitSeconds)}</span></span>
          </div>
          <button class="btn btn--brass" type="button" data-jw-geo>${esc(locale.findButton)}</button>
          <p class="jw__geo-status" data-jw-status></p>
          <p class="jw__note">${esc(locale.widgetNote)}</p>
        </aside>`;
}

function localizedCityGrid(locale) {
  return cities
    .map(
      (c) =>
        `<a class="city-link" href="${cityPath(c, locale)}">${esc(fill(locale.cityH1, cityVars(c, locale)))} <span>${esc(localizedCountryName(c.country, locale))}</span></a>`
    )
    .join('');
}

function localizedFooterCities(locale) {
  return cities
    .slice(0, 8)
    .map((c) => `<a href="${cityPath(c, locale)}">${esc(fill(locale.cityH1, cityVars(c, locale)))}</a>`)
    .join('');
}

function languageLinks(currentPath) {
  return LOCALES.map((locale) => {
    const href = locale.code === 'en' ? currentPath.replace(/^\/[a-z]{2}(?=\/)/, '') : `/${locale.code}${currentPath.replace(/^\/[a-z]{2}(?=\/)/, '')}`;
    return `<a href="${href === '' ? '/' : href}">${esc(locale.localName)}</a>`;
  }).join('');
}

function localizedFooter(locale, currentPath) {
  return `  <footer class="site-footer">
    <div class="wrap site-footer__grid">
      <div>
        <a class="brand" href="${topPath('home', locale)}" aria-label="Jumma Time home"><span class="brand__name">Jumma Time</span></a>
        <p style="font-size:0.9rem;max-width:34ch;margin-top:0.4rem">${esc(locale.footerText)}</p>
      </div>
      <div>
        <h4>${esc(locale.footerFind)}</h4>
        <a href="${topPath('near', locale)}">${esc(locale.navNear)}</a>
        <a href="${topPath('what', locale)}">${esc(locale.navWhat)}</a>
        <a href="${topPath('travel', locale)}">${esc(locale.navTravel)}</a>
        <a href="${topPath('masjid', locale)}">${esc(locale.masjidH1)}</a>
      </div>
      <div>
        <h4>${esc(locale.footerCities)}</h4>
        <div>${localizedFooterCities(locale)}</div>
      </div>
      <div>
        <h4>${esc(locale.footerApp)}</h4>
        <a href="${PLAY}" data-play="footer-${locale.code}" target="_blank" rel="noopener">${esc(locale.installApp)}</a>
        <a href="${WEBAPP}" target="_blank" rel="noopener">${esc(locale.useWebApp)}</a>
        <a href="${topPath('forMasjids', locale)}">${esc(locale.navMasjids)}</a>
      </div>
      <div>
        <h4>${esc(locale.footerLanguages || 'Languages')}</h4>
        <div class="language-links">${languageLinks(currentPath)}</div>
      </div>
    </div>
    <div class="wrap site-footer__legal"><p>&copy; 2026 Jumma Time. ${esc(locale.legal)}</p></div>
  </footer>
</body>
</html>`;
}

/* ---------- city page template ---------- */
function cityPage(c) {
  const url = `${SITE}/jumma-time/${c.slug}.html`;
  const jsonldGraph = jsonld([
    imageNode(`${url}#primaryimage`),
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url: url,
      name: `Jumma / Jummah time in ${c.name}`,
      description: `Find community-posted Jumma and Jummah Friday prayer times at masjids in ${c.name}, ${c.country}.`,
      about: `Finding Jumma and Jummah (Friday prayer) times at masjids in ${c.name}, ${c.country}`,
      isPartOf: { '@id': WEBSITE_ID },
      primaryImageOfPage: { '@id': `${url}#primaryimage` },
      dateModified: fileDate('data/cities.json'),
      inLanguage: 'en',
      breadcrumb: { '@id': `${url}#breadcrumb` },
      mainEntity: { '@id': `${url}#faq` }
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Jummah time by city', item: `${SITE}/jumma-near-me.html` },
        { '@type': 'ListItem', position: 3, name: `Jummah time in ${c.name}` }
      ]
    },
    {
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: [
        {
          '@type': 'Question',
          name: `What time is Jumma or Jummah in ${c.name}?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Jumma, also spelled Jummah, is prayed after midday on Friday in ${c.name}, replacing the Dhuhr prayer. The exact jamat time is set by each masjid and shifts through the year with Dhuhr (${c.timezone}). To find the current time at a masjid near you, use the Find masjids near me button or install the free Takbeer Time app.`
          }
        },
        {
          '@type': 'Question',
          name: `How do I find a masjid for Jummah in ${c.name}?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Install Takbeer Time, allow location access, and open the masjid map. It shows masjids near you in ${c.name} with current Jumma, Jummah, and jamat times posted by local timekeepers.`
          }
        }
      ]
    }
  ]);

  return `${head({
    title: `Jumma / Jummah Time in ${c.name}: Friday Prayer at Masjids | Jumma Time`,
    description: `Find Jumma and Jummah prayer times in ${c.name}. Check nearby masjids, multiple Friday prayer sessions, and current jamat times in the free Takbeer Time app.`,
    url: url,
    alternates: cityAlternates(c),
    jsonld: jsonldGraph
  })}
${HEADER}
  <main id="main">
    <div class="wrap">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a> &rsaquo; <a href="/jumma-near-me.html">Cities</a> &rsaquo; Jummah time in ${esc(c.name)}
      </nav>
    </div>

    <section class="hero">
      <div class="wrap hero__grid">
        <div>
          <p class="eyebrow">${esc(c.country)} &middot; ${esc(c.timezone)}</p>
          <h1>Jumma / Jummah time in <span class="accent">${esc(c.name)}</span></h1>
          <p class="hero__lead">
            Need Jummah in ${esc(c.name)} this Friday? Compare nearby masjids and community-posted
            Jumma and Jummah times so you can choose a congregation you can actually reach.
          </p>
          <div class="btn-row">
            <a class="btn btn--primary" href="${PLAY}" data-play="city-hero" target="_blank" rel="noopener">Install the free app</a>
            <a class="btn btn--ghost" href="#masjids">Check masjids</a>
          </div>
          <p class="hero-note">Free, no ads. Times are shared by local worshippers and masjid timekeepers in the Takbeer Time app.</p>
        </div>
        ${widget()}
      </div>
    </section>

    <section class="section-tight">
      <div class="wrap">
        <div class="quick-answer">
          <span class="eyebrow">Quick answer</span>
          <p>
            <strong>Jumma in ${esc(c.name)}</strong>, also spelled <strong>Jummah</strong>, is not one fixed city-wide time. It is prayed after Dhuhr,
            and each masjid sets its own jamat time, often between <strong>12:30 PM and 2:00 PM</strong>.
            To find the current <strong>Jummah time near you in ${esc(c.name)}</strong>, tap “Find masjids near me”
            or install the free <strong>Takbeer Time</strong> app.
          </p>
        </div>
      </div>
    </section>

    <section class="section-tight">
      <div class="wrap prose">
        <h2>Finding Jummah in ${esc(c.name)}</h2>
        <p>${esc(cityBlurb(c))}</p>
        <p>
          Because Jummah times move with Dhuhr and differ from masjid to masjid, a generic prayer-time estimate
          is not enough. Takbeer Time gives you masjid-level Jumma, Jummah, and jamat times that the local community keeps
          current. If you spot a Jummah time on a masjid door in ${esc(c.name)}, you can post it to help the next traveler.
        </p>
        <p><strong>Traveler tip:</strong> ${esc(cityTip(c))}</p>
      </div>
    </section>

    <section id="masjids" class="section-tight">
      <div class="wrap prose">
        ${cityMasjidSection(c)}
        <div class="btn-row" style="margin-top:1.2rem">
          <a class="btn btn--primary" href="${PLAY}" data-play="city-masjids" target="_blank" rel="noopener">Find masjids in ${esc(c.name)}</a>
          <a class="btn btn--ghost" href="${WEBAPP}" target="_blank" rel="noopener">Use the web app</a>
        </div>
      </div>
    </section>

    <section class="faq">
      <div class="wrap">
        <p class="eyebrow">Quick answers</p>
        <h2>Jumma / Jummah in ${esc(c.name)} — FAQ</h2>
        <div style="margin-top:1.2rem">
          <details>
            <summary>What time is Jumma or Jummah in ${esc(c.name)}?</summary>
            <p>Jumma, also spelled Jummah, is prayed after midday on Friday in ${esc(c.name)}, replacing Dhuhr. The exact jamat time is set by each masjid and shifts through the year with Dhuhr (${esc(c.timezone)}). Use the Find masjids near me button or the Takbeer Time app for the current time at a masjid near you.</p>
          </details>
          <details>
            <summary>How do I find a masjid for Jummah in ${esc(c.name)}?</summary>
            <p>Install Takbeer Time, allow location access, and open the masjid map. It shows masjids near you in ${esc(c.name)} with current Jumma, Jummah, and jamat times posted by local timekeepers.</p>
          </details>
          <details>
            <summary>Do masjids in ${esc(c.name)} hold more than one Jummah?</summary>
            <p>Many larger masjids do, especially in busy areas, to fit working congregations. The app lists each Jummah session and its start time so you can pick the one you can reach.</p>
          </details>
        </div>
      </div>
    </section>

    <section class="section-tight">
      <div class="wrap">
        <div class="cta-band">
          <p class="eyebrow" style="color:var(--brass-soft)">Don't miss the first takbeer</p>
          <h2>Find your next Jummah in ${esc(c.name)}.</h2>
          <p>Install Takbeer Time, compare nearby masjids, and stop guessing the Friday prayer time.</p>
          <div class="btn-row">
            <a class="btn btn--brass" href="${PLAY}" data-play="city-footer" target="_blank" rel="noopener">Install on Android</a>
            <a class="btn btn--ghost" style="color:var(--paper-2);border-color:var(--green-3)" href="${WEBAPP}" target="_blank" rel="noopener">Use the web app</a>
          </div>
          <p style="margin-top:1rem;font-size:0.9rem;color:#b9c9bd">
            Already use it? <a style="color:var(--brass-soft)" href="${PLAY}" data-play="review" target="_blank" rel="noopener">Leave a review</a> so more travelers find it.
          </p>
        </div>
      </div>
    </section>

    <section class="section-tight">
      <div class="wrap">
        <p class="eyebrow">More cities</p>
        <h2>Jumma / Jummah time in other cities</h2>
        <div class="city-grid" style="margin-top:1.2rem"><!--CITYGRID--><!--/CITYGRID--></div>
      </div>
    </section>
  </main>

${footer()}
`;
}

const LOCALIZED_TOP_CONFIG = {
  home: { prefix: 'home', sectionId: 'overview' },
  near: { prefix: 'near', sectionId: 'overview' },
  what: { prefix: 'what', sectionId: 'explained' },
  travel: { prefix: 'travel', sectionId: 'overview' },
  masjid: { prefix: 'masjid', sectionId: 'masjid' },
  forMasjids: { prefix: 'for', sectionId: 'for-masjids' }
};

function localizedTopPage(pageKey, locale) {
  const config = LOCALIZED_TOP_CONFIG[pageKey];
  const prefix = config.prefix;
  const localPath = topPath(pageKey, locale);
  const url = absoluteUrl(localPath);
  const title = locale[`${prefix}Title`];
  const description = locale[`${prefix}Desc`];
  const h1 = locale[`${prefix}H1`];
  const lead = locale[`${prefix}Lead`];
  const quick = locale[`${prefix}Quick`];
  const jsonldGraph = jsonld([
    imageNode(`${url}#primaryimage`),
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: title,
      description,
      isPartOf: { '@id': WEBSITE_ID },
      primaryImageOfPage: { '@id': `${url}#primaryimage` },
      dateModified: fileDate('data/locales.json'),
      inLanguage: locale.code
    }
  ]);

  const cityBlock =
    pageKey === 'home' || pageKey === 'near' || pageKey === 'travel'
      ? `<section class="section-tight" id="cities">
      <div class="wrap">
        <p class="eyebrow">${esc(locale.footerCities)}</p>
        <h2>${esc(locale.cityGridTitle)}</h2>
        <div class="city-grid" style="margin-top:1.2rem">${localizedCityGrid(locale)}</div>
      </div>
    </section>`
      : '';

  return `${head({
    title,
    description,
    url,
    lang: locale.code,
    dir: locale.dir,
    alternates: topAlternates(pageKey),
    jsonld: jsonldGraph
  })}
${localizedHeader(locale, pageKey)}
  <main id="main">
    <section class="hero">
      <div class="wrap hero__grid">
        <div>
          <p class="eyebrow">${esc(locale.localName)}</p>
          <h1>${esc(h1)}</h1>
          <p class="hero__lead">${esc(lead)}</p>
          <div class="btn-row">
            <a class="btn btn--primary" href="${PLAY}" data-play="${pageKey}-${locale.code}" target="_blank" rel="noopener">${esc(locale.installApp)}</a>
            <a class="btn btn--ghost" href="${topPath('near', locale)}">${esc(locale.navNear)}</a>
          </div>
        </div>
        ${localizedWidget(locale)}
      </div>
    </section>

    <section class="section-tight">
      <div class="wrap">
        <div class="quick-answer">
          <span class="eyebrow">${esc(locale.quickAnswer)}</span>
          <p>${esc(quick)}</p>
        </div>
      </div>
    </section>

    <section class="section-tight" id="${config.sectionId}">
      <div class="wrap prose">
        <h2>${esc(locale.bodyTitle)}</h2>
        <p>${esc(locale.body)}</p>
        <div class="btn-row" style="margin-top:1.2rem">
          <a class="btn btn--primary" href="${PLAY}" data-play="${pageKey}-body-${locale.code}" target="_blank" rel="noopener">${esc(locale.installApp)}</a>
          <a class="btn btn--ghost" href="${WEBAPP}" target="_blank" rel="noopener">${esc(locale.useWebApp)}</a>
        </div>
      </div>
    </section>

    ${cityBlock}
  </main>
${localizedFooter(locale, localPath)}
`;
}

function localizedCityMasjidSection(c, locale) {
  const vars = cityVars(c, locale);
  const verified = verifiedMasjids(c);

  // Real Jummah times from Takbeer Time — the table itself is language-neutral
  // (masjid names + times), shown under the localized funnel heading and copy.
  if (verified.length > 0) {
    return `<h2>${esc(fill(locale.cityCheckTitle, vars))}</h2>
        <p>${esc(fill(locale.cityCheckBody, vars))}</p>
        ${masjidTimesTable(c, verified)}
        <p class="source-note">${esc(fill(locale.citySourceNote, vars))}</p>`;
  }

  const list = c.masjids && c.masjids.length
    ? `<ul>
            ${c.masjids.map((m) => `<li>${esc(masjidName(m))}</li>`).join('\n            ')}
        </ul>`
    : '';

  return `<h2>${esc(fill(locale.cityCheckTitle, vars))}</h2>
        <p>${esc(fill(locale.cityCheckBody, vars))}</p>
        ${list}
        <p class="source-note">${esc(fill(locale.citySourceNote, vars))}</p>`;
}

function localizedCityPage(c, locale) {
  const localPath = cityPath(c, locale);
  const url = absoluteUrl(localPath);
  const vars = cityVars(c, locale);
  const title = fill(locale.cityTitle, vars);
  const description = fill(locale.cityDesc, vars);
  const jsonldGraph = jsonld([
    imageNode(`${url}#primaryimage`),
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: fill(locale.cityH1, vars),
      description,
      about: title,
      isPartOf: { '@id': WEBSITE_ID },
      primaryImageOfPage: { '@id': `${url}#primaryimage` },
      dateModified: fileDate('data/locales.json'),
      inLanguage: locale.code,
      mainEntity: { '@id': `${url}#faq` }
    },
    {
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: [
        {
          '@type': 'Question',
          name: fill(locale.cityFaqQ1, vars),
          acceptedAnswer: { '@type': 'Answer', text: fill(locale.cityFaqA1, vars) }
        },
        {
          '@type': 'Question',
          name: fill(locale.cityFaqQ2, vars),
          acceptedAnswer: { '@type': 'Answer', text: fill(locale.cityFaqA2, vars) }
        }
      ]
    }
  ]);

  return `${head({
    title,
    description,
    url,
    lang: locale.code,
    dir: locale.dir,
    alternates: cityAlternates(c),
    jsonld: jsonldGraph
  })}
${localizedHeader(locale, 'near')}
  <main id="main">
    <section class="hero">
      <div class="wrap hero__grid">
        <div>
          <p class="eyebrow">${esc(vars.country)} &middot; ${esc(c.timezone)}</p>
          <h1>${esc(fill(locale.cityH1, vars))}</h1>
          <p class="hero__lead">${esc(fill(locale.cityLead, vars))}</p>
          <div class="btn-row">
            <a class="btn btn--primary" href="${PLAY}" data-play="city-${locale.code}" target="_blank" rel="noopener">${esc(locale.installApp)}</a>
            <a class="btn btn--ghost" href="#masjids">${esc(locale.checkMasjids)}</a>
          </div>
        </div>
        ${localizedWidget(locale)}
      </div>
    </section>

    <section class="section-tight">
      <div class="wrap">
        <div class="quick-answer">
          <span class="eyebrow">${esc(locale.quickAnswer)}</span>
          <p>${esc(fill(locale.cityQuick, vars))}</p>
        </div>
      </div>
    </section>

    <section class="section-tight">
      <div class="wrap prose">
        <h2>${esc(fill(locale.cityH1, vars))}</h2>
        <p>${esc(fill(locale.cityBody, vars))}</p>
      </div>
    </section>

    <section id="masjids" class="section-tight">
      <div class="wrap prose">
        ${localizedCityMasjidSection(c, locale)}
        <div class="btn-row" style="margin-top:1.2rem">
          <a class="btn btn--primary" href="${PLAY}" data-play="city-masjids-${locale.code}" target="_blank" rel="noopener">${esc(locale.findButton)}</a>
          <a class="btn btn--ghost" href="${WEBAPP}" target="_blank" rel="noopener">${esc(locale.useWebApp)}</a>
        </div>
      </div>
    </section>

    <section class="faq">
      <div class="wrap">
        <p class="eyebrow">${esc(locale.quickAnswer)}</p>
        <h2>${esc(fill(locale.cityFaqTitle, vars))}</h2>
        <div style="margin-top:1.2rem">
          <details>
            <summary>${esc(fill(locale.cityFaqQ1, vars))}</summary>
            <p>${esc(fill(locale.cityFaqA1, vars))}</p>
          </details>
          <details>
            <summary>${esc(fill(locale.cityFaqQ2, vars))}</summary>
            <p>${esc(fill(locale.cityFaqA2, vars))}</p>
          </details>
        </div>
      </div>
    </section>

    <section class="section-tight">
      <div class="wrap">
        <p class="eyebrow">${esc(locale.footerCities)}</p>
        <h2>${esc(locale.cityMoreTitle)}</h2>
        <div class="city-grid" style="margin-top:1.2rem">${localizedCityGrid(locale)}</div>
      </div>
    </section>
  </main>
${localizedFooter(locale, localPath)}
`;
}

/* ---------- marker injection ---------- */
function inject(html, marker, content) {
  const re = new RegExp(`<!--${marker}-->[\\s\\S]*?<!--/${marker}-->`, 'g');
  return html.replace(re, `<!--${marker}-->${content}<!--/${marker}-->`);
}

function alternateLinkHtml(alternates) {
  return alternates.map((a) => `  <link rel="alternate" hreflang="${a.hreflang}" href="${a.href}" />`).join('\n');
}

function injectAlternateLinks(html, alternates) {
  const canonical = html.match(/  <link rel="canonical" href="[^"]+" \/>\n/);
  if (!canonical) return html;
  const re = /  <link rel="canonical" href="[^"]+" \/>\n(?:  <link rel="alternate" hreflang="[^"]+" href="[^"]+" \/>\n)+/;
  return html.replace(re, `${canonical[0]}${alternateLinkHtml(alternates)}\n`);
}

function injectGoogleAnalytics(html) {
  if (html.includes(GA_MEASUREMENT_ID)) return html;
  const tag = `${googleAnalyticsTag()}\n`;
  if (html.includes('  <script type="application/ld+json">')) {
    return html.replace('  <script type="application/ld+json">', `${tag}  <script type="application/ld+json">`);
  }
  return html.replace('</head>', `${tag}</head>`);
}

const cityGridHtml = cities
  .map(
    (c) =>
      `<a class="city-link" href="/jumma-time/${c.slug}.html">Jummah time in ${esc(c.name)} <span>${esc(c.country)}</span></a>`
  )
  .join('');

const footerCitiesHtml = cities
  .slice(0, 8)
  .map((c) => `<a href="/jumma-time/${c.slug}.html">Jummah time in ${esc(c.name)}</a>`)
  .join('');

function topPageKeyForFile(fileName) {
  if (fileName === 'index.html') return 'home';
  if (fileName === 'jumma-near-me.html') return 'near';
  if (fileName === 'what-time-is-jumma.html') return 'what';
  if (fileName === 'jumma-while-traveling.html') return 'travel';
  if (fileName === 'jumma-in-masjid.html') return 'masjid';
  if (fileName === 'for-masjids.html') return 'forMasjids';
  return null;
}

/* ---------- write city pages ---------- */
const cityDir = path.join(ROOT, 'jumma-time');
if (!fs.existsSync(cityDir)) fs.mkdirSync(cityDir, { recursive: true });

cities.forEach((c) => {
  let html = cityPage(c);
  html = inject(html, 'CITYGRID', cityGridHtml);
  html = inject(html, 'FOOTERCITIES', footerCitiesHtml);
  const filePath = path.join(cityDir, `${c.slug}.html`);
  console.log(`  ${writeIfChanged(filePath, html) ? 'wrote' : 'unchanged'} jumma-time/${c.slug}.html`);
});

/* ---------- inject markers into hand-written pages ---------- */
const topPages = fs
  .readdirSync(ROOT)
  .filter((f) => f.endsWith('.html'));

topPages.forEach((f) => {
  const p = path.join(ROOT, f);
  let html = fs.readFileSync(p, 'utf8');
  const hasInjectableMarkers = html.indexOf('<!--CITYGRID-->') !== -1 || html.indexOf('<!--FOOTERCITIES-->') !== -1;
  if (hasInjectableMarkers) {
    html = inject(html, 'CITYGRID', cityGridHtml);
    html = inject(html, 'FOOTERCITIES', footerCitiesHtml);
  }
  html = injectGoogleAnalytics(html);
  const pageKey = topPageKeyForFile(f);
  if (pageKey) html = injectAlternateLinks(html, topAlternates(pageKey));
  console.log(`  ${writeIfChanged(p, html) ? 'updated' : 'unchanged'} ${f}`);
});

/* ---------- localized pages ---------- */
LOCALES.filter((locale) => locale.code !== 'en').forEach((locale) => {
  LOCALIZED_PAGE_KEYS.forEach((pageKey) => {
    const localPath = topPath(pageKey, locale);
    const filePath = localFilePath(localPath);
    ensureDirFor(filePath);
    console.log(`  ${writeIfChanged(filePath, localizedTopPage(pageKey, locale)) ? 'wrote' : 'unchanged'} ${localPath}`);
  });

  cities.forEach((city) => {
    const localPath = cityPath(city, locale);
    const filePath = localFilePath(localPath);
    ensureDirFor(filePath);
    writeIfChanged(filePath, localizedCityPage(city, locale));
  });
  console.log(`  wrote localized ${locale.code} city pages`);
});

/* ---------- sitemap ---------- */
const urls = [
  { loc: `${SITE}/`, file: 'index.html', pri: '1.0', freq: 'weekly' },
  { loc: `${SITE}/jumma-near-me.html`, file: 'jumma-near-me.html', pri: '0.9', freq: 'weekly' },
  { loc: `${SITE}/what-time-is-jumma.html`, file: 'what-time-is-jumma.html', pri: '0.9', freq: 'monthly' },
  { loc: `${SITE}/jumma-while-traveling.html`, file: 'jumma-while-traveling.html', pri: '0.9', freq: 'monthly' },
  { loc: `${SITE}/jumma-in-masjid.html`, file: 'jumma-in-masjid.html', pri: '0.8', freq: 'monthly' },
  { loc: `${SITE}/for-masjids.html`, file: 'for-masjids.html', pri: '0.7', freq: 'monthly' }
].concat(
  cities.map((c) => ({
    loc: `${SITE}/jumma-time/${c.slug}.html`,
    file: `jumma-time/${c.slug}.html`,
    pri: '0.8',
    freq: 'monthly'
  }))
);

LOCALES.filter((locale) => locale.code !== 'en').forEach((locale) => {
  LOCALIZED_PAGE_KEYS.forEach((pageKey) => {
    const localPath = topPath(pageKey, locale);
    urls.push({
      loc: absoluteUrl(localPath),
      file: localPath.replace(/^\//, '').replace(/\/$/, '/index.html'),
      pri: pageKey === 'home' ? '0.9' : '0.7',
      freq: 'monthly'
    });
  });
  cities.forEach((city) => {
    const localPath = cityPath(city, locale);
    urls.push({
      loc: absoluteUrl(localPath),
      file: localPath.replace(/^\//, ''),
      pri: '0.6',
      freq: 'monthly'
    });
  });
});

const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${fileDate(u.file)}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`
    )
    .join('\n') +
  '\n</urlset>\n';

console.log(`  ${writeIfChanged(path.join(ROOT, 'sitemap.xml'), sitemap) ? 'wrote' : 'unchanged'} sitemap.xml`);
console.log(`Done — ${cities.length} city pages, ${topPages.length} top-level pages scanned.`);
