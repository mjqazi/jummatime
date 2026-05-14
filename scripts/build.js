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

const cities = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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
    alternateName: ['JummaTime', 'Jummah Time', 'Juma Time', 'Find Jumma Near Me'],
    description: 'Find community-posted Jumma and Friday prayer times at nearby masjids.',
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
      'Takbeer Time helps travelers and local worshippers find nearby masjids with community-posted Jumma, jamat, jamaat, and iqamah times.',
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

/* ---------- shared fragments ---------- */
function head(opts) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0F2A1E" />
  <title>${esc(opts.title)}</title>
  <meta name="description" content="${esc(opts.description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <meta name="author" content="${BRAND}" />
  <link rel="canonical" href="${opts.url}" />
  <link rel="alternate" hreflang="en" href="${opts.url}" />
  <link rel="alternate" hreflang="x-default" href="${opts.url}" />
  <link rel="icon" type="image/png" sizes="512x512" href="/assets/brand/jummatime-icon-512.png" />
  <link rel="apple-touch-icon" href="/assets/brand/jummatime-icon-512.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta name="application-name" content="Jumma Time" />
  <meta name="google-play-app" content="app-id=com.takbeertime.android" />
  <meta property="og:locale" content="en_US" />
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
        <a href="/jumma-near-me.html">Jumma near me</a>
        <a href="/what-time-is-jumma.html">What time is Jumma</a>
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
        <h4>Find Jumma</h4>
        <a href="/jumma-near-me.html">Jumma near me</a>
        <a href="/what-time-is-jumma.html">What time is Jumma</a>
        <a href="/jumma-while-traveling.html">Jumma while traveling</a>
        <a href="/jumma-in-masjid.html">Jumma in the masjid</a>
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
      <p>&copy; 2026 Jumma Time. A community project — free, no ads, sadqa fe sabilillah. Jumma times are crowd-sourced; always confirm with your local masjid.</p>
    </div>
  </footer>
</body>
</html>`;
}

/* ---------- city page template ---------- */
function cityPage(c) {
  const url = `${SITE}/jumma-time/${c.slug}.html`;
  const masjidList = c.masjids.map((m) => `<li>${esc(m)}</li>`).join('\n            ');
  const jsonldGraph = jsonld([
    imageNode(`${url}#primaryimage`),
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url: url,
      name: `Jumma time in ${c.name}`,
      description: `Find community-posted Jumma and Friday prayer times at masjids in ${c.name}, ${c.country}.`,
      about: `Finding Jumma (Friday prayer) times at masjids in ${c.name}, ${c.country}`,
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
        { '@type': 'ListItem', position: 2, name: 'Jumma time by city', item: `${SITE}/jumma-near-me.html` },
        { '@type': 'ListItem', position: 3, name: `Jumma time in ${c.name}` }
      ]
    },
    {
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: [
        {
          '@type': 'Question',
          name: `What time is Jumma in ${c.name}?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Jumma in ${c.name} is prayed shortly after midday on Friday, replacing the Dhuhr prayer. The exact jamat time is set by each masjid and shifts through the year with Dhuhr (${c.timezone}). To find the exact time at a masjid near you, use the Find masjids near me button or install the free Takbeer Time app.`
          }
        },
        {
          '@type': 'Question',
          name: `How do I find a masjid for Jumma in ${c.name}?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Install Takbeer Time, allow location access, and open the masjid map. It shows masjids near you in ${c.name} with real Jumma and jamat times posted by local timekeepers.`
          }
        }
      ]
    }
  ]);

  return `${head({
    title: `Jumma Time in ${c.name}: Friday Prayer at Masjids | Jumma Time`,
    description: `Find community-posted Jumma times in ${c.name}. See nearby masjids, multiple Friday prayer sessions, and current jamat times in the free Takbeer Time app.`,
    url: url,
    jsonld: jsonldGraph
  })}
${HEADER}
  <main id="main">
    <div class="wrap">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a> &rsaquo; <a href="/jumma-near-me.html">Cities</a> &rsaquo; Jumma time in ${esc(c.name)}
      </nav>
    </div>

    <section class="hero">
      <div class="wrap hero__grid">
        <div>
          <p class="eyebrow">${esc(c.country)} &middot; ${esc(c.timezone)}</p>
          <h1>Jumma time in <span class="accent">${esc(c.name)}</span></h1>
          <p class="hero__lead">
            Need Jumma in ${esc(c.name)} this Friday? Compare nearby masjids and community-posted
            Jumma times so you can choose a congregation you can actually reach.
          </p>
          <div class="btn-row">
            <a class="btn btn--primary" href="${PLAY}" data-play="city-hero" target="_blank" rel="noopener">Install the free app</a>
            <a class="btn btn--ghost" href="#masjids">Notable masjids</a>
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
            <strong>Jumma in ${esc(c.name)}</strong> is not one fixed city-wide time. It is prayed after Dhuhr,
            and each masjid sets its own jamat time, often between <strong>12:30 PM and 2:00 PM</strong>.
            To find the current <strong>Jumma time near you in ${esc(c.name)}</strong>, tap “Find masjids near me”
            or install the free <strong>Takbeer Time</strong> app.
          </p>
        </div>
      </div>
    </section>

    <section class="section-tight">
      <div class="wrap prose">
        <h2>Finding Jumma in ${esc(c.name)}</h2>
        <p>${esc(c.blurb)}</p>
        <p>
          Because Jumma times move with Dhuhr and differ from masjid to masjid, a generic prayer-time estimate
          is not enough. Takbeer Time gives you masjid-level Jumma and jamat times that the local community keeps
          current. If you spot a Jumma time on a masjid door in ${esc(c.name)}, you can post it to help the next traveler.
        </p>
        <p><strong>Traveler tip:</strong> ${esc(c.tip)}</p>
      </div>
    </section>

    <section id="masjids" class="section-tight">
      <div class="wrap prose">
        <h2>Notable masjids in ${esc(c.name)}</h2>
        <p>A few well-known masjids to orient you. Open Takbeer Time for the full list near your exact location, with current Jumma and jamat times:</p>
        <ul>
            ${masjidList}
        </ul>
        <div class="btn-row" style="margin-top:1.2rem">
          <a class="btn btn--primary" href="${PLAY}" data-play="city-masjids" target="_blank" rel="noopener">Find masjids in ${esc(c.name)}</a>
          <a class="btn btn--ghost" href="${WEBAPP}" target="_blank" rel="noopener">Use the web app</a>
        </div>
      </div>
    </section>

    <section class="faq">
      <div class="wrap">
        <p class="eyebrow">Quick answers</p>
        <h2>Jumma in ${esc(c.name)} — FAQ</h2>
        <div style="margin-top:1.2rem">
          <details>
            <summary>What time is Jumma in ${esc(c.name)}?</summary>
            <p>Jumma in ${esc(c.name)} is prayed shortly after midday on Friday, replacing Dhuhr. The exact jamat time is set by each masjid and shifts through the year with Dhuhr (${esc(c.timezone)}). Use the Find masjids near me button or the Takbeer Time app for the exact time at a masjid near you.</p>
          </details>
          <details>
            <summary>How do I find a masjid for Jumma in ${esc(c.name)}?</summary>
            <p>Install Takbeer Time, allow location access, and open the masjid map. It shows masjids near you in ${esc(c.name)} with real Jumma and jamat times posted by local timekeepers.</p>
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
          <h2>Find your next Jumma in ${esc(c.name)}.</h2>
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
        <h2>Jumma time in other cities</h2>
        <div class="city-grid" style="margin-top:1.2rem"><!--CITYGRID--><!--/CITYGRID--></div>
      </div>
    </section>
  </main>

${footer()}
`;
}

/* ---------- marker injection ---------- */
function inject(html, marker, content) {
  const re = new RegExp(`<!--${marker}-->[\\s\\S]*?<!--/${marker}-->`, 'g');
  return html.replace(re, `<!--${marker}-->${content}<!--/${marker}-->`);
}

const cityGridHtml = cities
  .map(
    (c) =>
      `<a class="city-link" href="/jumma-time/${c.slug}.html">Jumma time in ${esc(c.name)} <span>${esc(c.country)}</span></a>`
  )
  .join('');

const footerCitiesHtml = cities
  .slice(0, 8)
  .map((c) => `<a href="/jumma-time/${c.slug}.html">Jumma time in ${esc(c.name)}</a>`)
  .join('');

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
  if (html.indexOf('<!--CITYGRID-->') === -1 && html.indexOf('<!--FOOTERCITIES-->') === -1) return;
  html = inject(html, 'CITYGRID', cityGridHtml);
  html = inject(html, 'FOOTERCITIES', footerCitiesHtml);
  console.log(`  ${writeIfChanged(p, html) ? 'injected city links into' : 'unchanged'} ${f}`);
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
