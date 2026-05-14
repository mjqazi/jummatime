#!/usr/bin/env node
/* Fetch real Jummah times from the Takbeer Time API and write
   data/city-masjid-times.json, keyed by city slug.

   Source of truth: https://takbeertime.com/api
     - /api/schedules  -> jummah times per mosque (paginated, 100/page)
     - /api/mosques?city=<name> -> mosque metadata (verified, views, website)

   Quality bar (per the project decision): only mosques that carry a
   community-submitted schedule with a Jummah time. Ranked so verified
   mosques and verified/upvoted schedules surface first; capped per city.

   Run: node scripts/fetch-masjid-times.js
   Network-only; does not touch the rest of the build. */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API = 'https://takbeertime.com/api';
const PER_CITY = 8;            // max masjids shown per city page
const SCHEDULE_PAGE_CAP = 250; // safety cap on schedule pages (100/page)
const CONCURRENCY = 5;
const TODAY = new Date().toISOString().slice(0, 10);

function slugify(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
}

async function pool(items, worker, size) {
  const out = [];
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return out;
}

function cleanTimes(jummah) {
  if (!Array.isArray(jummah)) return [];
  const seen = new Set();
  const out = [];
  for (const t of jummah) {
    const v = String(t).trim();
    if (/^\d{1,2}:\d{2}$/.test(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out.sort();
}

/* ---- 1. crawl every schedule, keep ones with a Jummah time ---- */
async function crawlSchedules() {
  const byMosque = new Map();
  let page = 1;
  for (; page <= SCHEDULE_PAGE_CAP; page++) {
    const d = await getJSON(`${API}/schedules?limit=100&page=${page}`);
    const rows = (d && d.data) || [];
    for (const s of rows) {
      const times = cleanTimes(s.timings && s.timings.jummah);
      if (!times.length || !s.mosqueId) continue;
      const prev = byMosque.get(s.mosqueId);
      const score =
        (s.verificationStatus === 'verified' ? 1000 : 0) +
        (Number(s.upvotes) || 0) - (Number(s.downvotes) || 0);
      // keep the strongest schedule per mosque
      if (!prev || score > prev.score) {
        byMosque.set(s.mosqueId, {
          mosqueId: s.mosqueId,
          name: (s.mosque && s.mosque.name) || 'Masjid',
          city: (s.mosque && s.mosque.city) || '',
          jummahTimes: times,
          verifiedSchedule: s.verificationStatus === 'verified',
          score
        });
      }
    }
    if (!d.pagination || !d.pagination.hasMore) break;
    if (page % 20 === 0) process.stdout.write(`  schedules: page ${page}\r`);
  }
  console.log(`  crawled ${page} schedule pages -> ${byMosque.size} mosques with Jummah times`);
  return byMosque;
}

/* ---- 2. per target city, pull mosque metadata and join ---- */
async function cityMosques(cityName) {
  const variants = [cityName];
  if (/ city$/i.test(cityName)) variants.push(cityName.replace(/ city$/i, ''));
  const seen = new Map();
  for (const v of variants) {
    for (let page = 1; page <= 3; page++) {
      let d;
      try {
        d = await getJSON(`${API}/mosques?city=${encodeURIComponent(v)}&limit=100&page=${page}`);
      } catch (e) {
        break;
      }
      const rows = (d && d.data) || [];
      for (const m of rows) if (!seen.has(m.id)) seen.set(m.id, m);
      if (!d.pagination || !d.pagination.hasMore) break;
    }
  }
  return [...seen.values()];
}

async function main() {
  const curated = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
  const priorityPath = path.join(ROOT, 'data', 'priority-cities.json');
  const priority = fs.existsSync(priorityPath)
    ? JSON.parse(fs.readFileSync(priorityPath, 'utf8'))
    : [];

  // mirror build.js combineCities: curated first, then priority capped 4/country
  const targets = [];
  const seenSlug = new Set();
  const perCountry = new Map();
  curated.concat(priority).forEach((c, i) => {
    const slug = c.slug || slugify(c.name);
    if (seenSlug.has(slug)) return;
    if (i >= curated.length && (perCountry.get(c.country) || 0) >= 4) return;
    seenSlug.add(slug);
    perCountry.set(c.country, (perCountry.get(c.country) || 0) + 1);
    targets.push({ slug, name: c.name, country: c.country });
  });
  console.log(`Targets: ${targets.length} cities`);

  console.log('Crawling Takbeer Time schedules...');
  const scheduleByMosque = await crawlSchedules();

  console.log('Joining mosque metadata per city...');
  const result = {};
  let withData = 0;
  let totalMasjids = 0;

  await pool(
    targets,
    async (city) => {
      const mosques = await cityMosques(city.name);
      const joined = [];
      for (const m of mosques) {
        const sched = scheduleByMosque.get(m.id);
        if (!sched) continue;
        // only mosques whose own city field matches the target (search is fuzzy)
        const sameCity =
          slugify(m.city || '') === slugify(city.name) ||
          slugify(m.city || '') === slugify(city.name.replace(/ city$/i, ''));
        if (!sameCity) continue;
        const popularity = (Number(m.viewCount) || 0) + (Number(m.favoriteCount) || 0);
        joined.push({
          name: m.name,
          jummahTimes: sched.jummahTimes,
          sourceUrl: m.website || `https://takbeertime.com/?mosque=${m.id}`,
          sourceLabel: m.website ? 'Masjid website' : 'Takbeer Time',
          lastChecked: TODAY,
          _rank:
            (m.verified ? 1e9 : 0) +
            (sched.verifiedSchedule ? 1e6 : 0) +
            popularity * 100 +
            sched.score
        });
      }
      joined.sort((a, b) => b._rank - a._rank);
      const top = joined.slice(0, PER_CITY).map((m) => {
        delete m._rank;
        return m;
      });
      if (top.length) {
        result[city.slug] = top;
        withData++;
        totalMasjids += top.length;
      }
    },
    CONCURRENCY
  );

  const outPath = path.join(ROOT, 'data', 'city-masjid-times.json');
  const ordered = {};
  Object.keys(result).sort().forEach((k) => (ordered[k] = result[k]));
  fs.writeFileSync(outPath, JSON.stringify(ordered, null, 2) + '\n');
  console.log(
    `Done. ${withData}/${targets.length} cities have real Jummah times ` +
      `(${totalMasjids} masjids total). Wrote data/city-masjid-times.json`
  );
}

main().catch((e) => {
  console.error('fetch-masjid-times failed:', e.message);
  process.exit(1);
});
