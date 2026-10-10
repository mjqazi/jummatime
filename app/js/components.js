// ═══════════════════════════════════════════════════════════════════
// Jamat — Component renderers
// Pure functions: data → DOM. No event wiring (that lives in app.js).
// ═══════════════════════════════════════════════════════════════════

const JUMMAH_KEYS = ['jummah', 'jummah_2', 'jummah_3'];
const PRAYER_ORDER = ['jummah', 'jummah_2', 'jummah_3', 'fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const DAILY_PRAYER_ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_LABEL = {
  fajr: 'Fajr', dhuhr: 'Dhuhr', zuhr: 'Dhuhr', asr: 'Asr',
  maghrib: 'Maghrib', isha: 'Isha', jummah: 'Jummah',
  jummah_2: 'Jummah 2', jummah_3: 'Jummah 3',
};

function isJummahKey(key) {
  return JUMMAH_KEYS.includes(key);
}

// Some mosques imported from OpenStreetMap have placeholder names like
// "Mosque (OSM way 1309955324)" because the OSM record had no name tag.
// Showing the raw OSM ID to users looks broken — render a friendlier
// "Unnamed mosque" instead. Translatable via i18n key 'mosque.unnamed'.
function prettifyMosqueName(name) {
  if (!name) return window.i18n?.t('mosque.unnamed') ?? 'Unnamed masjid';
  // The OSM importer writes "Mosque (OSM way 123…)" placeholders for records
  // with no name tag. Same regex still catches them — the source data uses
  // "Mosque" regardless of our UI vocabulary.
  if (/^Mosque \(OSM (way|node|relation) \d+\)$/.test(name)) {
    return window.i18n?.t('mosque.unnamed') ?? 'Unnamed masjid';
  }
  return name;
}

// Display a human-friendly version of a contributor name. The server
// stores fullName as whatever was provided at sign-up; for users who
// went through dev-auth or who filled in only an email, that's the
// email's local-part (e.g. "junaid.qazi.veemed"). Showing that raw
// reads as a system handle, not a name. We prettify only when the
// string looks like a machine handle — leave any string with spaces
// or capitals alone, since those are likely real names.
function prettifyPersonName(name) {
  if (!name || typeof name !== 'string') return name;
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  // Already humanised — has whitespace or capitals → trust the server.
  if (/\s/.test(trimmed) || /[A-Z]/.test(trimmed)) return trimmed;
  // All-lowercase, no spaces — likely an email local-part. Split on .
  // / _ / - and title-case each token. Single-token strings stay as-is
  // so handles like "junaid42" don't get touched.
  const tokens = trimmed.split(/[._\-]+/).filter(Boolean);
  if (tokens.length < 2) return trimmed;
  return tokens.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
}

// Treat literal "Unknown" (any casing) and empty/null as missing data.
// OSM imports sometimes write "Unknown" into city/address when the source
// record has no admin info — better to omit the field than display the
// placeholder.
function isPlaceholderField(s) {
  if (!s) return true;
  const v = s.trim().toLowerCase();
  return v === 'unknown' || v === 'testcity';
}

// Hide automated-test fixtures from user-visible lists. The e2e suite
// creates mosques like "E2E Test Masjid 1777208486603" — they leak into
// the real browse list when the test DB is the same as the dev DB.
function isTestFixture(m) {
  if (!m) return false;
  const name = (m.name || '').trim();
  if (/^E2E Test Masjid /i.test(name)) return true;
  if (/^Test Mosque /i.test(name)) return true;
  return false;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === false || v == null) {/* skip */}
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

// Format an "HH:MM" 24-hour string as locale-friendly 12-hour with am/pm.
// Returns the input unchanged if it doesn't look like a time. Lowercase
// "am"/"pm" reads more like a brand voice than the shouty "AM"/"PM".
function fmt12(t) {
  if (typeof t !== 'string') return t;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const mm = m[2];
  if (h < 0 || h > 23) return t;
  const period = h >= 12 ? 'pm' : 'am';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${mm} ${period}`;
}

function fmtDistance(km) {
  if (km == null || isNaN(km)) return '';
  const t = (key, fallback, params) => window.i18n?.t(key, params) ?? fallback;
  if (km < 1) {
    const n = Math.round(km * 1000);
    return t('dist.meters', `${n} m away`, { n });
  }
  const n = km.toFixed(km < 10 ? 1 : 0);
  return t('dist.km', `${n} km away`, { n });
}

function parseClockTime(t) {
  if (typeof t !== 'string') return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, min };
}

function normalizePrayerTime(key, t) {
  const parsed = parseClockTime(t);
  if (!parsed) return t;
  let { h } = parsed;
  const { min } = parsed;
  // Some existing rows came from 12-hour-looking picker values for
  // post-noon prayers: Dhuhr 01:30, Asr 05:30, Isha 09:00. Lift only
  // plausible afternoon/evening prayers so Fajr and 11:xx Jummah stay valid.
  const shouldLiftToPm =
    ((key === 'dhuhr' || key === 'zuhr' || isJummahKey(key)) && h >= 1 && h <= 4) ||
    (key === 'asr' && h >= 1 && h <= 7) ||
    (key === 'maghrib' && h >= 4 && h <= 9) ||
    (key === 'isha' && h >= 5 && h <= 11);
  if (shouldLiftToPm) h += 12;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function normalizeSubmittedPrayerTime(key, t) {
  const parsed = parseClockTime(t);
  if (!parsed) return t;
  let { h } = parsed;
  const { min } = parsed;
  if (key !== 'fajr' && h < 12) h += 12;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function defaultSubmittedPrayerTime(key) {
  return ({
    fajr: '05:00',
    dhuhr: '13:00',
    zuhr: '13:00',
    asr: '17:00',
    isha: '20:00',
    jummah: '13:00',
    jummah_2: '14:00',
    jummah_3: '15:00',
  })[key] || '';
}

function timingForPrayer(timings, key) {
  if (!timings) return undefined;
  let raw;
  if (key === 'dhuhr') {
    raw = timings.zuhr || timings.dhuhr;
  } else if (isJummahKey(key)) {
    const index = JUMMAH_KEYS.indexOf(key);
    raw = Array.isArray(timings.jummah) ? timings.jummah[index] : timings[key];
  } else {
    raw = timings[key];
  }
  return normalizePrayerTime(key, Array.isArray(raw) ? raw[0] : raw);
}

function jummahTimesForTimings(timings) {
  if (!timings) return [];
  return JUMMAH_KEYS
    .map((key, index) => {
      const time = timingForPrayer(timings, key);
      if (!time) return null;
      return {
        key,
        label: PRAYER_LABEL[key] || (index === 0 ? 'Jummah' : `Jummah ${index + 1}`),
        time,
      };
    })
    .filter(Boolean);
}

function orderedTimingKeysForDate(date, timings, { jummahFirst = false } = {}) {
  const todaysOrder = prayerOrderForDate(date, timings);
  const jummahKeys = jummahTimesForTimings(timings).map(row => row.key);
  if (!jummahFirst) {
    return todaysOrder.includes('jummah')
      ? [...todaysOrder, ...jummahKeys.filter(key => key !== 'jummah')]
      : [...todaysOrder, ...jummahKeys];
  }
  return [...jummahKeys, ...todaysOrder.filter(key => !isJummahKey(key))];
}

function hasCoordinates(m) {
  const lat = Number(m?.coordinates?.lat ?? m?.latitude);
  const lng = Number(m?.coordinates?.lng ?? m?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function routeIcon(width = 14, height = 14) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M12 2 4 21l8-4 8 4-8-19Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 2v15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>';
  return svg;
}

function timingsFromMosque(m) {
  // Prefer the effective schedule (active keeper's latest submission,
  // including the user's own update when they're a keeper) over the
  // master defaultJamaatTimings. Without this, the hero and the drawer
  // can drift apart: a fresh submission lands in effectiveTimings first,
  // and a hero that only watched defaultJamaatTimings would keep showing
  // the previous schedule until the master record caught up.
  //
  // Merge effective ON TOP of default: if effectiveTimings only carries
  // the prayer the keeper just updated (server is allowed to send a
  // partial schedule), unupdated prayers fall back to the master record
  // instead of rendering as undefined in the hero.
  let t = null;
  if (m && (m.effectiveTimings || m.defaultJamaatTimings)) {
    const fallback = m.defaultJamaatTimings || {};
    const e = m.effectiveTimings || {};
    const hasDailyTiming = ['fajr', 'dhuhr', 'zuhr', 'asr', 'isha'].some(k => e[k] || fallback[k]);
    const pickJummahSlot = (index) => {
      const key = JUMMAH_KEYS[index];
      const fromEffective = Array.isArray(e.jummah) ? e.jummah[index] : e[key];
      const fromFallback = Array.isArray(fallback.jummah) ? fallback.jummah[index] : fallback[key];
      return fromEffective ?? fromFallback;
    };
    t = {
      fajr:          normalizePrayerTime('fajr', e.fajr  ?? fallback.fajr),
      zuhr:          normalizePrayerTime('dhuhr', e.dhuhr ?? e.zuhr ?? fallback.zuhr ?? fallback.dhuhr),
      asr:           normalizePrayerTime('asr', e.asr   ?? fallback.asr),
      maghribOffset: e.maghribOffset ?? fallback.maghribOffset,
      hasDailyTiming,
      isha:          normalizePrayerTime('isha', e.isha  ?? fallback.isha),
      jummah:        normalizePrayerTime('jummah', pickJummahSlot(0)),
      jummah_2:      normalizePrayerTime('jummah_2', pickJummahSlot(1)),
      jummah_3:      normalizePrayerTime('jummah_3', pickJummahSlot(2)),
      // Carry coords on the timings object so multi-day consumers
      // (computeNextPrayer, reminders.schedule) can recompute Maghrib from
      // each day's astronomical sunset instead of reusing today's value.
      lat:           m?.coordinates?.lat ?? m?.latitude ?? null,
      lng:           m?.coordinates?.lng ?? m?.longitude ?? null,
    };
  }
  if (!t) return null;
  // Maghrib = today's astronomical sunset + the contributor's takbeer
  // offset (e.g. +3 min). Only show it when a keeper/default schedule
  // actually carries a Maghrib offset. A Jummah-only submission should
  // not turn into a daily Maghrib listing just because coordinates exist.
  const hasAnyJummahTiming = JUMMAH_KEYS.some(key => timingForPrayer(t, key));
  const shouldComputeMaghrib = t.hasDailyTiming || !hasAnyJummahTiming;
  if (window.sun && m && shouldComputeMaghrib && Number.isFinite(Number(t.maghribOffset))) {
    const computedMaghrib = window.sun.maghribForMosque(m, undefined, Number(t.maghribOffset));
    if (computedMaghrib) {
      return { ...t, maghrib: normalizePrayerTime('maghrib', computedMaghrib) };
    }
  }
  return t;
}

function prayerOrderForDate(date, timings) {
  const isFriday = date.getDay() === 5;
  const firstJummahKey = JUMMAH_KEYS.find(key => timingForPrayer(timings, key));
  if (isFriday && firstJummahKey) {
    return ['fajr', firstJummahKey, 'asr', 'maghrib', 'isha'];
  }
  return DAILY_PRAYER_ORDER;
}

// Returns {key, label, time, minutesUntil} for the next upcoming prayer.
// Jummah is date-aware: on Friday it replaces Dhuhr when present; on other
// days it is not treated as a daily prayer. The look-ahead lets a mosque with
// only Jummah submitted still surface next Friday instead of a fake daily row.
function computeNextPrayer(timings, { jummahOnly = false } = {}) {
  if (!timings) return null;
  const now = new Date();
  const candidates = [];
  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() + dayOffset);
    const order = jummahOnly
      ? (day.getDay() === 5 ? JUMMAH_KEYS : [])
      : prayerOrderForDate(day, timings);
    for (const key of order) {
      let t = timingForPrayer(timings, key);
      // Maghrib tracks the sun: recompute it for *this* look-ahead day rather
      // than reusing today's sunset. Only override an already-present Maghrib
      // so a Jummah-only schedule doesn't sprout a daily Maghrib row.
      if (key === 'maghrib' && t && window.sun
          && Number.isFinite(Number(timings.maghribOffset))
          && timings.lat != null && timings.lng != null) {
        const perDay = window.sun.maghribForMosque(
          { latitude: timings.lat, longitude: timings.lng }, day, Number(timings.maghribOffset));
        if (perDay) t = perDay;
      }
      if (!t || typeof t !== 'string') continue;
      const parsed = parseClockTime(t);
      if (!parsed) continue;
      const target = new Date(day);
      target.setHours(parsed.h, parsed.min, 0, 0);
      if (target <= now) continue;
      candidates.push({
        key,
        label: PRAYER_LABEL[key],
        time: t,
        minutes: parsed.h * 60 + parsed.min,
        target,
      });
    }
  }
  if (!candidates.length) return null;
  const next = candidates.sort((a, b) => a.target - b.target)[0];
  const minutesUntil = Math.ceil((next.target - now) / 60000);
  return { ...next, minutesUntil };
}

function computeNextJummah(timings) {
  return computeNextPrayer(timings, { jummahOnly: true });
}

// ───── Mosque card ─────
// `isDefault` (when truthy) renders the set-default pill in the
// confirmed-state ("✓ Default") rather than the call-to-action state.
// app.js's makeCard passes effectiveDefaultMosqueId() === m.id.
function renderCard(m, { highlightNext = true, isDefault = false } = {}) {
  const timings = timingsFromMosque(m);
  const next = highlightNext ? computeNextJummah(timings) : null;
  const jummahTimes = jummahTimesForTimings(timings);
  const isClosed = m.status === 'closed';

  const cleanCity = isPlaceholderField(m.city) ? '' : m.city;
  const cleanAddress = isPlaceholderField(m.address) ? '' : m.address;

  // Pill that lets the user pick this masjid as their default straight
  // from the list, without first opening the detail drawer. It's a real
  // <button> nested inside the card's clickable region — app.js wires a
  // stopPropagation handler so tapping it doesn't also open the drawer.
  // The data-set-default attribute is the hook the click delegate keys
  // off, so the markup stays declarative and the JS doesn't need a
  // direct reference to each pill.
  const defaultPill = el('button', {
    class: 'card__set-default' + (isDefault ? ' is-default' : ''),
    type: 'button',
    'data-set-default': m.id,
    'aria-pressed': isDefault ? 'true' : 'false',
    'aria-label': `${window.i18n?.t(isDefault ? 'card.isDefault' : 'card.makeDefault') ?? 'My masjid'}: ${prettifyMosqueName(m.name)}`,
  }, isDefault
    ? (window.i18n?.t('card.isDefault') ?? '✓ Default')
    : (window.i18n?.t('card.makeDefault') ?? 'Set as default'));

  const navigateButton = hasCoordinates(m)
    ? el('button', {
      class: 'card__navigate',
      type: 'button',
      'data-navigate': m.id,
      'aria-label': `${window.i18n?.t('nav.navigate') ?? 'Directions'}: ${prettifyMosqueName(m.name)}`,
    }, [
      routeIcon(),
      el('span', {}, window.i18n?.t('nav.navigate') ?? 'Navigate to Masjid'),
    ])
    : null;

  const metaItems = [];
  if (cleanCity) metaItems.push(el('span', {}, cleanCity));
  if (isClosed) {
    metaItems.push(el('span', { class: 'card__status-closed', title: 'Marked permanently closed by the highest-rated time keeper' }, 'permanently closed'));
  } else if (m.verified) {
    const verified = window.i18n?.t('card.verified') ?? 'Verified';
    metaItems.push(el('span', { class: 'card__verified', title: verified }, verified));
  } else {
    metaItems.push(el('span', { class: 'dot' }));
  }

  const timeItems = isClosed
    ? [
        el('span', { class: 'card__next card__next--closed' }, window.i18n?.t('card.closed') ?? 'Closed masjid'),
        el('span', { class: 'card__notimes card__notimes--closed' }, window.i18n?.t('card.closedVoting') ?? 'Keeper voting stays open'),
        m.distanceKm != null ? el('span', { class: 'card__distance' }, fmtDistance(m.distanceKm)) : null,
      ]
    : jummahTimes.length
    ? [
        el('span', { class: 'card__jummah-label' }, window.i18n?.t('prayer.jummah') ?? 'Jummah'),
        el('span', { class: 'card__jummah-time' }, jummahTimes.map((row, index) =>
          el('span', { class: 'card__session' }, `${fmt12(row.time)}${index < jummahTimes.length - 1 ? ' /' : ''}`))),
        next && jummahTimes.length > 1
          ? el('span', { class: 'card__next card__next--secondary' }, `${window.i18n?.t('next.tag') ?? 'Next'}: ${window.i18n?.t(`prayer.${next.key}`) ?? next.label} ${fmt12(next.time)}`)
          : null,
        m.distanceKm != null ? el('span', { class: 'card__distance' }, fmtDistance(m.distanceKm)) : null,
      ]
    : [
        el('span', { class: 'card__notimes' }, m.timingDetailsLoaded === false
          ? (window.i18n?.t('card.openJummah') ?? 'Open for Jummah times')
          : (window.i18n?.t('next.noTimes') ?? 'Jummah time not added yet')),
        m.distanceKm != null
          ? el('span', { class: 'card__distance' }, fmtDistance(m.distanceKm))
          : null,
      ];

  return el('li', { class: 'card' + (isClosed ? ' is-closed' : ''), dataset: { id: m.id }, tabindex: '0', role: 'button' }, [
    el('div', { class: 'card__main' }, [
      el('h3', { class: 'card__name' }, prettifyMosqueName(m.name)),
      cleanAddress ? el('p', { class: 'card__addr' }, cleanAddress) : null,
      el('div', { class: 'card__meta' }, metaItems),
    ]),
    el('div', { class: 'card__times' }, timeItems),
    el('div', { class: 'card__actions' }, [navigateButton, defaultPill]),
  ]);
}

// ───── Detail drawer body ─────
function renderTimingsTable(timings) {
  if (!timings) {
    return el('tr', {}, el('td', {}, el('span', { class: 'contributors__empty' }, window.i18n?.t('contributors.empty') ?? 'No timings recorded yet.')));
  }
  const next = computeNextPrayer(timings);
  const order = orderedTimingKeysForDate(new Date(), timings, { jummahFirst: true });
  return order.map(key => {
    const t = timingForPrayer(timings, key);
    const label = (typeof window !== 'undefined' && window.i18n?.t(`prayer.${key}`)) || PRAYER_LABEL[key];
    if (!t) return null;
    const isNext = next && next.key === key;
    const isPassed = !isNext && timeBefore(key, t);
    return el('tr', {}, [
      el('td', { class: 'name' }, label),
      el('td', {
        class: 'time' + (isNext ? ' time--upcoming' : isPassed ? ' time--passed' : ''),
      }, fmt12(t)),
    ]);
  }).filter(Boolean);
}

function timeBefore(key, t) {
  const now = new Date();
  const parsed = parseClockTime(normalizePrayerTime(key, t));
  if (!parsed) return false;
  return (parsed.h * 60 + parsed.min) < (now.getHours() * 60 + now.getMinutes());
}

function renderAmenities(mosqueOrList) {
  const mosque = Array.isArray(mosqueOrList) ? { amenities: mosqueOrList } : (mosqueOrList || {});
  const legacyAmenities = Array.isArray(mosque.amenities) ? mosque.amenities : [];
  const ratings = mosque.amenityRatings || {};
  const tx = (key, fallback, params) => window.i18n?.t(key, params) ?? fallback;
  const rows = [
    { kind: 'size', label: tx('amenities.size', 'Size'), meta: tx('amenities.sizeMeta', 'capacity & space'), icon: '⌂' },
    { kind: 'wudu', label: tx('amenities.wudu', 'Wudu area'), meta: tx('amenities.wuduMeta', 'cleanliness & flow'), icon: '◌' },
    { kind: 'washrooms', label: tx('amenities.washrooms', 'Washrooms'), meta: tx('amenities.washroomsMeta', 'cleanliness'), icon: 'WC' },
    { kind: 'accessibility', label: tx('amenities.accessibility', 'Accessibility'), meta: tx('amenities.accessibilityMeta', 'ramps & seating'), icon: '♿' },
  ];

  const pretty = (s) => String(s || '').replace(/_/g, ' ');
  const legacyText = legacyAmenities.length ? legacyAmenities.map(pretty).join(' · ') : '';

  return rows.map((row) => {
    const rating = ratings[row.kind] || {};
    const avg = Number(rating.avg) || 0;
    const count = Number(rating.count) || 0;
    const score = count > 0
      ? el('p', { class: 'amenity-row__score' }, [
          el('strong', {}, avg.toFixed(1)),
          ` · ${count} ${count === 1 ? 'rating' : 'ratings'}`,
        ])
      : el('p', { class: 'amenity-row__score' }, tx('amenities.noRatings', 'Not rated yet'));
    return el('li', { class: 'amenity-row', dataset: { kind: row.kind }, tabindex: '0', role: 'button' }, [
      el('div', { class: 'amenity-row__icon', 'aria-hidden': 'true' }, row.icon),
      el('div', { class: 'amenity-row__body' }, [
        el('p', { class: 'amenity-row__label' }, row.label),
        el('p', { class: 'amenity-row__meta' }, row.kind === 'size' && legacyText ? legacyText : row.meta),
      ]),
      el('div', { class: 'amenity-row__rating' }, [
        el('span', { class: 'stars', style: `--val:${Math.max(0, Math.min(5, avg))}` }),
        score,
      ]),
    ]);
  });
}

// Convert minutes to {h, m, s} relative to a fixed prayer time
function clockParts(minutesUntil, secsRemainder = 0) {
  const totalSec = Math.max(0, minutesUntil * 60 - secsRemainder);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { h: String(h).padStart(2, '0'), m: String(m).padStart(2, '0'), s: String(s).padStart(2, '0') };
}

function renderKeeper(keeper, { effectiveKeeperId, preferredKeeperId, topKeeperId, currentUserId, onFollow, onVote, onSuggest, onSelfUpdate, onWithdraw }) {
  const isEffective = keeper.submitterId === effectiveKeeperId;
  const isPreferred = keeper.submitterId === preferredKeeperId;
  const isTopRated = keeper.submitterId === topKeeperId;
  const isCurrentSchedule = !!keeper.activeSchedule;
  const isOwnKeeper = currentUserId && keeper.submitterId === currentUserId;
  const canVote = !!keeper.latestSubmissionId;
  const t = keeper.timings || {};
  const keeperPrayerTimes = [
    { key: 'jummah', labelKey: 'prayer.jummah', label: PRAYER_LABEL.jummah, aliases: ['jummah'] },
    { key: 'jummah_2', labelKey: 'prayer.jummah_2', label: PRAYER_LABEL.jummah_2, aliases: ['jummah_2'] },
    { key: 'jummah_3', labelKey: 'prayer.jummah_3', label: PRAYER_LABEL.jummah_3, aliases: ['jummah_3'] },
    { key: 'fajr', labelKey: 'prayer.fajr', label: PRAYER_LABEL.fajr, aliases: ['fajr'] },
    { key: 'dhuhr', labelKey: 'prayer.dhuhr', label: PRAYER_LABEL.dhuhr, aliases: ['dhuhr', 'zuhr'] },
    { key: 'asr', labelKey: 'prayer.asr', label: PRAYER_LABEL.asr, aliases: ['asr'] },
    { key: 'maghrib', labelKey: 'prayer.maghrib', label: PRAYER_LABEL.maghrib, aliases: ['maghrib'] },
    { key: 'isha', labelKey: 'prayer.isha', label: PRAYER_LABEL.isha, aliases: ['isha'] },
  ];
  const timingValue = (prayer) => {
    if (isJummahKey(prayer.key) && Array.isArray(t.jummah)) {
      return t.jummah[JUMMAH_KEYS.indexOf(prayer.key)] || null;
    }
    const aliases = prayer.aliases || [prayer.key];
    for (const key of aliases) {
      const value = t[key];
      if (Array.isArray(value)) return value[0] || null;
      if (value != null && value !== '') return value;
    }
    return null;
  };
  const timeTiles = keeperPrayerTimes.map(prayer => {
    const raw = normalizePrayerTime(prayer.key, timingValue(prayer));
    return el('li', {
      class: 'keeper-card__time' + (!raw ? ' keeper-card__time--missing' : ''),
      title: raw ? `${prayer.label}: ${fmt12(raw)}` : `${prayer.label}: not set`,
    }, [
      el('span', {}, window.i18n?.t(prayer.labelKey) ?? prayer.label),
      el('strong', {}, raw ? fmt12(raw) : 'Not set'),
    ]);
  });

  const verified = keeper.verifiedContributor
    ? el('span', { class: 'verified' }, '✓ verified')
    : null;
  const followerCount = Number(keeper.followerCount) || 0;
  const followerLabel = window.i18n
    ? window.i18n.t(followerCount === 1 ? 'next.oneFollower' : (followerCount === 0 ? 'next.noFollowers' : 'next.manyFollowers'), { n: followerCount })
    : (followerCount === 1 ? '1 follower' : (followerCount === 0 ? 'No followers yet' : `${followerCount} followers`));
  const tx = (key, fallback, params) => window.i18n?.t(key, params) ?? fallback;
  const followLabel = isPreferred
    ? tx('keeper.stopUsingTimings', "Stop using this time keeper's timings")
    : tx('keeper.useTimings', "Use this time keeper's timings");

  const sourceLabel = isPreferred
    ? tx('keeper.sourcePreferred', 'You are using timings provided by this time keeper')
    : (isEffective && isTopRated
      ? tx('keeper.sourceDefault', 'Default highest-rated time keeper - these timings are used now')
      : (isCurrentSchedule
        ? tx('keeper.sourceCurrent', 'Current masjid schedule - these timings are used now')
        : (keeper.verifiedSchedule
          ? tx('keeper.sourceVerifiedHistory', 'Verified previous schedule from this time keeper')
          : (keeper.latestSourceType === 'prayerSchedule'
            ? tx('keeper.sourceScheduleHistory', 'Previous schedule from this time keeper')
            : tx('keeper.sourceSubmission', 'Timing submission from this time keeper')))));
  const versionLabel = `v${keeper.submissionCount || 1}`;
  const rawRating = Number(keeper.rating) || 0;
  const starRating = rawRating <= 5 ? rawRating : Math.min(5, rawRating / 4);
  const ratingLabel = `★ ${starRating.toFixed(1)}`;
  const updatedAt = keeper.updatedAt || keeper.submittedAt || keeper.latestSubmittedAt || keeper.latestSubmissionAt || keeper.activeSchedule?.updatedAt;
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : (isCurrentSchedule ? 'current schedule' : 'recent');
  const person = prettifyPersonName(keeper.submitterName) || 'Time keeper';
  const initials = person
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'TK';

  const followBtn = el('button', {
    class: isPreferred ? 'btn btn--ghost keeper-card__primary' : 'btn btn--primary keeper-card__primary',
    type: 'button',
    onclick: (e) => { e.stopPropagation(); onFollow(keeper); },
  }, isPreferred ? tx('keeper.stopUsingTimings', 'Stop using these timings') : tx('keepers.useThese', 'Use these times'));

  // Up/down vote buttons. The submission backend rejects votes on your own
  // submission with a 400; we let that through and surface as a toast.
  // Thumbs-up / thumbs-down icons (currentColor inherits the button's color).
  const thumbSvg = (down) => {
    const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrap.setAttribute('viewBox', '0 0 24 24');
    wrap.setAttribute('width', '14');
    wrap.setAttribute('height', '14');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.display = 'block';
    if (down) wrap.style.transform = 'rotate(180deg) scaleX(-1)';
    wrap.innerHTML = '<path d="M7 11h2v9H7a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2zm5 9h6.6a2 2 0 0 0 1.96-1.6l1.2-6A2 2 0 0 0 19.8 10H15V6a2 2 0 0 0-2-2l-1 5-3 3v8z" fill="currentColor"/>';
    return wrap;
  };
  const upBtn = canVote ? el('button', {
    class: 'keeper-card__vote keeper-card__vote--up',
    type: 'button',
    'aria-label': tx('keepers.voteUp', `Mark ${person} as helpful`),
    title: tx('keepers.voteUp', `Mark ${person} as helpful`),
    dataset: { type: 'upvote' },
    onclick: (e) => { e.stopPropagation(); onVote(keeper, 'upvote'); },
  }, thumbSvg(false)) : null;
  const downBtn = canVote ? el('button', {
    class: 'keeper-card__vote keeper-card__vote--down',
    type: 'button',
    'aria-label': tx('keepers.voteDown', `Mark ${person} as unhelpful`),
    title: tx('keepers.voteDown', `Mark ${person} as unhelpful`),
    dataset: { type: 'downvote' },
    onclick: (e) => { e.stopPropagation(); onVote(keeper, 'downvote'); },
  }, thumbSvg(true)) : null;

  // Plain-language action button. For your own card, say exactly what the
  // user is about to do; for another keeper, make it clear this is a
  // suggestion sent to that keeper, not an immediate edit.
  const suggestBtn = isOwnKeeper && onSelfUpdate
    ? el('button', {
        class: 'btn btn--ghost keeper-card__secondary',
        type: 'button',
        onclick: (e) => { e.stopPropagation(); onSelfUpdate(keeper); },
      }, tx('keepers.updateTimes', 'Update times'))
    : (!isOwnKeeper && onSuggest)
    ? el('button', {
        class: 'btn btn--ghost keeper-card__secondary',
        type: 'button',
        onclick: (e) => { e.stopPropagation(); onSuggest(keeper); },
      }, tx('keepers.suggestCorrection', 'Suggest a correction'))
    : null;
  const withdrawBtn = (isOwnKeeper && onWithdraw)
    ? el('button', {
        class: 'btn btn--ghost btn--danger keeper-card__secondary',
        type: 'button',
        onclick: (e) => { e.stopPropagation(); onWithdraw(keeper); },
      }, tx('keepers.stopBeingKeeper', 'Stop being time keeper here'))
    : null;

  return el('li', {
    class: 'keeper-card'
      + (isPreferred ? ' is-following' : '')
      + (isTopRated && !isPreferred && !isEffective ? ' is-top-rated' : ''),
    'aria-current': isEffective ? 'true' : 'false',
    dataset: { id: keeper.submitterId, submissionId: keeper.latestSubmissionId || '' },
  }, [
    isEffective ? el('span', { class: 'keeper-card__ribbon' }, tx('keepers.currentlyUsing', '✓ Currently using')) : null,
    el('header', { class: 'keeper-card__head' }, [
      el('div', { class: 'keeper-card__avatar', 'aria-hidden': 'true' }, initials),
      el('div', { class: 'keeper-card__id' }, [
        el('p', { class: 'keeper-card__name' }, person),
        el('p', { class: 'keeper-card__meta', 'aria-label': `${ratingLabel}, ${followerLabel}` }, [
          el('span', { class: 'keeper-card__rating', title: `Composite score: ${rawRating.toFixed(2)}` }, ratingLabel),
          el('span', { class: 'keeper-card__sep', 'aria-hidden': 'true' }, '·'),
          el('span', {}, followerLabel),
          el('span', { class: 'keeper-card__sep', 'aria-hidden': 'true' }, '·'),
          el('span', {}, versionLabel),
          verified,
        ]),
      ]),
      canVote ? el('div', { class: 'keeper-card__votes' }, [upBtn, downBtn]) : null,
    ]),
    el('p', { class: 'keeper-card__source' }, sourceLabel),
    el('ul', { class: 'keeper-card__times' }, timeTiles),
    el('footer', { class: 'keeper-card__foot' }, [
      el('span', { class: 'keeper-card__updated' }, [
        `${tx('keepers.updated', 'Updated')} `,
        el('time', { datetime: updatedAt || '' }, updatedLabel),
      ]),
      el('div', { class: 'keeper-card__actions' }, [followBtn, suggestBtn, withdrawBtn]),
    ]),
  ]);
}

// ─── Timetable photo scan helpers ───
// Pure so the unit suite can pin them down; app.js does the DOM work.

const SCAN_FORM_PRAYERS = ['fajr', 'dhuhr', 'asr', 'isha', 'jummah'];

/**
 * Compare what the camera read against what the submit form was pre-filled
 * with. One row per submittable prayer, in form order, so the summary list
 * and the highlighted inputs are driven by the same data.
 *
 *   current — { fajr: '05:00', ... } from the form (HH:mm or '')
 *   scanned — server `timings` (HH:mm; jummah may be an array)
 *   unread  — server `unread` list (prayers the board did not show)
 *
 * status: 'changed' (differs from current), 'new' (form was blank),
 *         'unchanged', or 'unread' (nothing usable came back).
 */
function scanTimingsDiff(current, scanned, unread = []) {
  const clean = (v) => {
    const raw = Array.isArray(v) ? v[0] : v;
    const parsed = parseClockTime(raw);
    if (!parsed) return '';
    return `${String(parsed.h).padStart(2, '0')}:${String(parsed.min).padStart(2, '0')}`;
  };
  return SCAN_FORM_PRAYERS.map((key) => {
    const from = clean(current?.[key]);
    const to = clean(scanned?.[key]);
    let status;
    if (!to) status = 'unread';
    else if (!from) status = 'new';
    else if (from === to) status = 'unchanged';
    else status = 'changed';
    return { key, from, to, status, onBoard: !(unread || []).includes(key) };
  });
}

/** i18n key + params describing how far the board clock is from the phone. */
function scanDriftDescriptor(driftMinutes) {
  if (driftMinutes == null || !Number.isFinite(driftMinutes) || driftMinutes === 0) {
    return { key: 'scan.driftNone', params: {} };
  }
  return driftMinutes > 0
    ? { key: 'scan.driftAhead', params: { n: driftMinutes } }
    : { key: 'scan.driftBehind', params: { n: Math.abs(driftMinutes) } };
}

const SCAN_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jummah'];

function _median(arr) {
  const n = arr.length;
  if (!n) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = (n - 1) / 2;
  return (s[m | 0] + s[Math.ceil(m)]) / 2;
}

function parseBoardClock(display) {
  if (typeof display !== 'string') return null;
  const m = display.trim().match(/^(\d{1,2})\s*[:.\s]\s*(\d{2})(?:\s*[:.\s]\s*(\d{2}))?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const s = m[3] ? parseInt(m[3], 10) : 0;
  if (h > 23 || min > 59 || s > 59) return null;
  return { h, m: min, s };
}

const _pad2 = (n) => String(n).padStart(2, '0');

function toPrayerTime24(key, display) {
  const parts = parseBoardClock(display);
  if (!parts) return null;
  let { h } = parts;
  if (h <= 12) {
    switch (key) {
      case 'fajr':
        if (h === 12) h = 0;
        break;
      case 'dhuhr':
      case 'jummah':
        if (h >= 1 && h <= 6) h += 12;
        break;
      case 'asr':
        if (h >= 1 && h <= 8) h += 12;
        break;
      case 'maghrib':
        if (h >= 3 && h <= 10) h += 12;
        break;
      case 'isha':
        if (h === 12) h = 0;
        else if (h >= 5 && h <= 11) h += 12;
        break;
    }
  }
  return `${_pad2(h)}:${_pad2(parts.m)}`;
}

function resolveBoardClock(display, clientLocalTime) {
  const board = parseBoardClock(display);
  if (!board) return null;
  const phone = parseBoardClock(clientLocalTime ?? null);

  const candidates = [];
  if (board.h >= 13) {
    candidates.push(board);
  } else {
    const base = board.h === 12 ? 0 : board.h;
    candidates.push({ ...board, h: base }, { ...board, h: base + 12 });
  }

  const toSeconds = (p) => p.h * 3600 + p.m * 60 + p.s;
  const wrapDiff = (secs) => {
    const day = 24 * 3600;
    let d = ((secs % day) + day) % day;
    if (d >= day / 2) d -= day;
    return d;
  };

  let chosen = candidates[0];
  let driftMinutes = null;
  if (phone) {
    let best = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      const d = wrapDiff(toSeconds(c) - toSeconds(phone));
      if (Math.abs(d) < Math.abs(best)) { best = d; chosen = c; }
    }
    // `|| 0` folds Math.round(-0.4) = -0 into a plain 0 for JSON and tests.
    driftMinutes = Math.round(best / 60) || 0;
  }

  return {
    display: String(display).trim(),
    time: `${_pad2(chosen.h)}:${_pad2(chosen.m)}:${_pad2(chosen.s)}`,
    driftMinutes,
  };
}

function _minutesOf(hhmm) {
  const p = parseBoardClock(hhmm);
  if (!p) return null;
  return p.h * 60 + p.m;
}

function _candidatesOf(row, boardIs24h) {
  const h = row.hh, m = row.mm;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return [];
  if (boardIs24h || h >= 13) return [h * 60 + m];
  if (h === 12) return [m, 12 * 60 + m];
  return [h * 60 + m, (h + 12) * 60 + m];
}

function _windowFits(c, prayer, windows) {
  if (!windows) return false;
  const win = prayer === 'jummah' ? (windows.jummah || windows.dhuhr) : windows[prayer];
  if (!win || win.start == null) return false;
  const start = _minutesOf(win.start);
  if (start == null) return false;
  const end = win.end == null ? null : _minutesOf(win.end);
  const fajrStart = windows.fajr ? _minutesOf(windows.fajr.start) : null;
  if (end == null) return c >= start || (fajrStart != null && c < fajrStart);
  if (end <= start) return c >= start || c < end;
  return start <= c && c < end;
}

function _pickCandidate(row, prayer, windows, boardIs24h) {
  if (!windows) return toPrayerTime24(prayer, row.display);
  for (const c of _candidatesOf(row, boardIs24h)) {
    if (_windowFits(c, prayer, windows)) {
      return `${_pad2(Math.floor(c / 60) % 24)}:${_pad2(c % 60)}`;
    }
  }
  return null;
}

function _digitWidth(row) {
  if (Number.isFinite(row.digitWidth)) return row.digitWidth;
  const n = (row.digits && row.digits.length) || 0;
  if (n && row.bbox && row.bbox.w) return row.bbox.w / n;
  return row.digitHeight ? row.digitHeight * (32 / 56) : 20;
}

function _pickJamatColumn(timeRows) {
  if (!timeRows.length) return { column: [], extras: [] };
  const medW = _median(timeRows.map(_digitWidth)) || 20;
  const thresh = 0.5 * medW;
  const indexed = timeRows.map((r) => ({ r, x: r.leftX }));
  indexed.sort((a, b) => a.x - b.x);
  const clusters = [];
  for (const item of indexed) {
    let placed = false;
    for (const cl of clusters) {
      const clMed = _median(cl.map((c) => c.x));
      if (Math.abs(item.x - clMed) <= thresh) {
        cl.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([item]);
  }
  const refined = clusters.map((cl) => {
    const medH = _median(cl.map((c) => c.r.digitHeight || 0));
    return cl.filter((c) => {
      const h = c.r.digitHeight || 0;
      return medH === 0 || Math.abs(h - medH) <= 0.25 * medH;
    });
  }).filter((cl) => cl.length);
  refined.sort((a, b) => b.length - a.length);
  const colSet = new Set(refined[0].map((c) => c.r));
  return {
    column: timeRows.filter((r) => colSet.has(r)),
    extras: timeRows.filter((r) => !colSet.has(r)),
  };
}

function _statusFromConf(conf) {
  if (conf >= 0.8) return 'ok';
  if (conf >= 0.5) return 'flag';
  return 'unread';
}

function _hhmmOf(v) {
  const raw = Array.isArray(v) ? v[0] : v;
  const p = parseBoardClock(raw);
  if (!p) return '';
  return `${_pad2(p.h)}:${_pad2(p.m)}`;
}

function _absMinDiff(a, b) {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}

function _s3OfMinutes(m) {
  if (m === 0 || m === 15 || m === 30 || m === 45) return 1;
  if (m % 5 === 0) return 0.85;
  return 0.45;
}

function _s4ChangePrior(prayer, time24, current) {
  if (current == null) return 1;
  const cur = _hhmmOf(current[prayer]);
  if (!cur) return 0.9;
  if (!time24) return 0.9;
  if (prayer === 'jummah') return cur === time24 ? 1 : 0.5;
  if (cur === time24) return 1;
  const a = _minutesOf(time24), b = _minutesOf(cur);
  if (a == null || b == null) return 0.9;
  const d = _absMinDiff(a, b);
  if (d <= 60) return 0.95;
  if (d <= 120) return 0.8;
  return 0.6;
}

function _pickReason(prayer, signals, opts) {
  if (signals.s2 === 0) return 'outside-window';
  if (prayer === 'jummah' && opts.jummahChanged) return 'jummah-changed';
  if (opts.altUsed) return 'alt-by-prior';
  if (signals.s3 === 0.45) return 'odd-minutes';
  if (signals.s4 <= 0.6 && opts.hasCurrent) return 'big-change';
  if (signals.s1 < 0.8) return 'low-digits';
  return null;
}

/**
 * Plausibility matrix (SPEC_ADDENDUM_MATRIX). Pure.
 * Maghrib keeps S3 = S4 = 1 (never submitted; sunset + offset).
 */
function scoreScanRow(row, opts) {
  opts = opts || {};
  const prayer = row.prayer;
  const windows = opts.windows;
  const current = opts.current;
  const boardIs24h = !!opts.boardIs24h;
  const s1Primary = clamp01(row.confidence);

  const evalOne = (display) => {
    const parsed = parseBoardClock(display);
    if (!parsed) return null;
    const fake = { display, hh: parsed.h, mm: parsed.m };
    const time24 = _pickCandidate(fake, prayer, windows, boardIs24h);
    const s2 = windows == null ? 0.8 : (time24 ? 1 : 0);
    const s3 = _s3OfMinutes(parsed.m);
    return { display, time24, s2, s3, prior: s2 * s3 };
  };

  const primary = evalOne(row.display);
  let chosen = primary;
  let altUsed = false;
  const alts = row.alternatives || [];
  if (primary && alts.length) {
    let bestAlt = null;
    for (const a of alts) {
      const ev = evalOne(a);
      if (!ev) continue;
      if (!bestAlt || ev.prior > bestAlt.prior) bestAlt = ev;
    }
    if (bestAlt && bestAlt.prior - primary.prior >= 0.3) {
      chosen = bestAlt;
      altUsed = true;
    }
  }

  const s1 = s1Primary;
  const s2 = chosen ? chosen.s2 : (windows == null ? 0.8 : 0);
  const s3 = prayer === 'maghrib' ? 1 : (chosen ? chosen.s3 : 0.45);
  const time24 = chosen ? chosen.time24 : (row.time24 || null);
  const display = chosen ? chosen.display : (row.display || '');
  const s4 = prayer === 'maghrib' ? 1 : _s4ChangePrior(prayer, time24, current);
  const plaus = s1 * s2 * s3 * s4;
  const signals = { s1, s2, s3, s4 };

  const cur = current != null ? _hhmmOf(current[prayer]) : '';
  const jummahChanged = prayer === 'jummah' && !!cur && !!time24 && cur !== time24;
  const hasCurrent = current != null && !!cur;
  let changeMinutes = null;
  if (hasCurrent && time24) {
    const a = _minutesOf(time24), b = _minutesOf(cur);
    if (a != null && b != null) changeMinutes = _absMinDiff(a, b);
  }

  let status = _statusFromConf(plaus);
  if (jummahChanged && status === 'ok') status = 'flag';
  if (altUsed && status === 'ok') status = 'flag';
  if (jummahChanged && plaus < 0.5) {
    status = 'unread';
  }

  let outTime24 = time24;
  if (status === 'unread') outTime24 = null;
  if (jummahChanged && plaus < 0.5) outTime24 = null;

  const reasonOpts = { jummahChanged, altUsed, hasCurrent };
  let reason = null;
  if (status !== 'ok') {
    reason = _pickReason(prayer, signals, reasonOpts);
  } else if (altUsed) {
    reason = 'alt-by-prior';
  }

  const out = {
    prayer,
    display,
    time24: outTime24,
    confidence: plaus,
    rowIndex: row.rowIndex != null ? row.rowIndex : -1,
    status,
    signals,
  };
  if (reason) out.reason = reason;
  if (changeMinutes != null) out.changeMinutes = changeMinutes;
  if (row.colour) out.colour = row.colour;
  if (row.alternatives) out.alternatives = row.alternatives;
  return out;
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function _makeUnread(prayer, opts) {
  const out = {
    prayer,
    display: opts.display || '',
    time24: null,
    confidence: opts.confidence || 0,
    rowIndex: opts.rowIndex != null ? opts.rowIndex : -1,
    status: 'unread',
  };
  if (opts.reason) out.reason = opts.reason;
  if (opts.alternatives) out.alternatives = opts.alternatives;
  if (opts.colour) out.colour = opts.colour;
  return out;
}

function _assigned(prayer, row, time24, rowIndex) {
  const confidence = row.confidence;
  const status = _statusFromConf(confidence);
  const out = {
    prayer,
    display: row.display,
    time24: status === 'unread' ? null : time24,
    confidence,
    rowIndex,
    status,
  };
  if (row.colour) out.colour = row.colour;
  if (row.alternatives) out.alternatives = row.alternatives;
  if (status === 'unread') out.reason = 'low-confidence';
  return out;
}

function _clockAbsDriftMinutes(display, clientLocalTime) {
  const resolved = resolveBoardClock(display, clientLocalTime);
  if (!resolved || resolved.driftMinutes == null) return null;
  return Math.abs(resolved.driftMinutes);
}

function _clockMatchesPhone(row, clientLocalTime) {
  if (!row || !row.display || !clientLocalTime) return false;
  if ((row.confidence || 0) < 0.5) return false;
  const drift = _clockAbsDriftMinutes(row.display, clientLocalTime);
  return drift != null && drift <= 20;
}

function _clockLikeRows(rows) {
  const list = rows || [];
  const timeRows = list.filter((r) => r.kind === 'time');
  const medTimeH = _median(timeRows.map((r) => r.digitHeight || 0));
  const clockLike = list.filter((r) =>
    r.kind === 'clock' || ((r.digitHeight || 0) >= 1.3 * medTimeH && medTimeH > 0));
  clockLike.sort((a, b) => {
    const ak = a.kind === 'clock' ? 0 : 1;
    const bk = b.kind === 'clock' ? 0 : 1;
    if (ak !== bk) return ak - bk;
    const ay = (a.bbox && a.bbox.y) || 0;
    const by = (b.bbox && b.bbox.y) || 0;
    return ay - by;
  });
  return clockLike;
}

function _pickMatchingClock(rows, clientLocalTime) {
  for (const row of _clockLikeRows(rows)) {
    if (_clockMatchesPhone(row, clientLocalTime)) return row;
  }
  return null;
}

function _redecodeRows(rows, threshold) {
  const reader = typeof window !== 'undefined' ? window.JAMAT_TIMETABLE_READER : null;
  if (!reader || typeof reader.redecodeRow !== 'function') return rows;
  const is24h = rows.some((r) => r.hh > 12);
  return rows.map((row) => reader.redecodeRow(row, { onThreshold: threshold, boardIs24h: is24h }));
}

function calibrateOnClock(reading, clientLocalTime) {
  const rows = ((reading && reading.rows) || []).slice();
  const empty = {
    rows,
    clockRow: null,
    clockMatched: false,
    calibration: { matched: false },
  };
  if (!clientLocalTime || !rows.length) return { ...empty, clockMatched: false, skipped: !clientLocalTime };

  const DEFAULT = 0.45;
  const SWEEP = [0.35, 0.40, 0.50, 0.55, 0.60];
  const matched = _pickMatchingClock(rows, clientLocalTime);
  if (matched) {
    return {
      rows,
      clockRow: matched,
      clockMatched: true,
      calibration: { matched: true, threshold: DEFAULT },
    };
  }

  let best = null;
  let bestDist = Infinity;
  let bestConf = -1;
  for (const t of SWEEP) {
    const redone = _redecodeRows(rows, t);
    const clock = _pickMatchingClock(redone, clientLocalTime);
    if (!clock) continue;
    const dist = Math.abs(t - DEFAULT);
    const conf = clock.confidence || 0;
    // Prefer a solid clock reading; among similar confidence, the threshold
    // closest to 0.45 (addendum C2).
    if (conf > bestConf + 0.05 || (Math.abs(conf - bestConf) <= 0.05 && dist < bestDist)) {
      bestDist = dist;
      bestConf = conf;
      best = { t, redone, clock };
    }
  }
  if (best) {
    return {
      rows: best.redone,
      clockRow: best.clock,
      clockMatched: true,
      calibration: { matched: true, threshold: best.t },
    };
  }

  const failed = rows.map((r) => {
    if (r.kind !== 'time') return r;
    return { ...r, confidence: r.confidence * 0.6 };
  });
  return {
    rows: failed,
    clockRow: null,
    clockMatched: false,
    calibration: { matched: false },
  };
}

function _currentPrayer(windows, clientLocalTime) {
  if (!windows || !clientLocalTime) return null;
  const t = _minutesOf(clientLocalTime);
  if (t == null) return null;
  const hits = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].filter((p) => _windowFits(t, p, windows));
  return hits.length === 1 ? hits[0] : null;
}

function _applyColourMismatch(assignedRows, currentPrayer) {
  if (!currentPrayer || !assignedRows) return;
  const filled = assignedRows.filter((r) => r.status === 'ok' || r.status === 'flag');
  const coloured = filled.filter((r) => r.colour && r.colour !== 'unknown');
  if (coloured.length < 2) return;
  const counts = {};
  for (const r of coloured) counts[r.colour] = (counts[r.colour] || 0) + 1;
  let majority = null, majorityN = 0;
  for (const c of Object.keys(counts)) {
    if (counts[c] > majorityN) { majority = c; majorityN = counts[c]; }
  }
  const odd = coloured.filter((r) => r.colour !== majority);
  if (odd.length !== 1) return;
  if (odd[0].prayer === currentPrayer) return;
  odd[0].confidence = odd[0].confidence / 2;
  odd[0].status = _statusFromConf(odd[0].confidence);
  odd[0].reason = 'colour-mismatch';
  if (odd[0].status === 'unread') odd[0].time24 = null;
}

function assignRowsToPrayers(rows, windows, opts) {
  opts = opts || {};
  const boardIs24h = !!opts.boardIs24h;
  const timeRows = (rows || []).filter((r) => r.kind === 'time');
  const { column, extras } = _pickJamatColumn(timeRows);
  column.sort((a, b) => ((a.bbox && a.bbox.y) || 0) - ((b.bbox && b.bbox.y) || 0));
  const extraDisplays = extras.map((r) => r.display);
  const n = column.length;
  const map5 = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const map6 = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jummah'];
  const assigned = {};

  const tryRegular = () => {
    const map = n === 6 ? map6 : map5;
    const out = {};
    let fails = 0;
    map.forEach((prayer, i) => {
      const row = column[i];
      const time24 = _pickCandidate(row, prayer, windows, boardIs24h);
      if (!time24) {
        out[prayer] = _makeUnread(prayer, {
          display: row.display, confidence: row.confidence, rowIndex: i, reason: 'outside-window',
          alternatives: row.alternatives, colour: row.colour,
        });
        fails++;
      } else {
        out[prayer] = _assigned(prayer, row, time24, i);
      }
    });
    return { out, fails };
  };

  let usedRegular = false;
  if (n === 5 || n === 6) {
    if (windows == null) {
      usedRegular = true;
      Object.assign(assigned, tryRegular().out);
    } else {
      const trial = tryRegular();
      if (trial.fails <= 1) {
        usedRegular = true;
        Object.assign(assigned, trial.out);
      }
    }
  }

  if (!usedRegular) {
    if (windows == null) {
      column.forEach((row, i) => {
        const p = SCAN_PRAYERS[i];
        if (p) {
          assigned[p] = _makeUnread(p, {
            display: row.display, confidence: row.confidence, rowIndex: i, reason: 'no-windows',
          });
        } else {
          extraDisplays.push(row.display);
        }
      });
      for (const p of SCAN_PRAYERS) {
        if (!assigned[p]) assigned[p] = _makeUnread(p, { reason: 'no-windows' });
      }
    } else {
      const remaining = SCAN_PRAYERS.slice();
      column.forEach((row, i) => {
        const fits = remaining.filter((p) => _pickCandidate(row, p, windows, boardIs24h));
        if (fits.length === 0) {
          extraDisplays.push(row.display);
          return;
        }
        // Earliest remaining prayer that fits is the vertical-order pick
        // (a lone Dhuhr-window row on Friday stays Dhuhr, not Jummah).
        const prayer = remaining[0] && fits.includes(remaining[0]) ? remaining[0] : fits[0];
        const time24 = _pickCandidate(row, prayer, windows, boardIs24h);
        assigned[prayer] = _assigned(prayer, row, time24, i);
        remaining.splice(remaining.indexOf(prayer), 1);
      });
      for (const p of remaining) {
        assigned[p] = _makeUnread(p, { reason: 'missing' });
      }
    }
  } else {
    for (const p of SCAN_PRAYERS) {
      if (!assigned[p]) assigned[p] = _makeUnread(p, { reason: 'missing' });
    }
  }

  const times = {};
  for (const p of SCAN_PRAYERS) {
    if (assigned[p] && assigned[p].time24) times[p] = _minutesOf(assigned[p].time24);
  }
  // Isha after midnight is later than Maghrib even though the clock wrapped.
  if (times.isha != null && times.maghrib != null && times.isha < times.maghrib) {
    times.isha += 24 * 60;
  }
  const pairs = [
    ['fajr', 'dhuhr', false],
    ['dhuhr', 'jummah', true],
    ['jummah', 'asr', false],
    ['dhuhr', 'asr', false],
    ['asr', 'maghrib', false],
    ['maghrib', 'isha', false],
  ];
  for (const [a, b, eqOk] of pairs) {
    if (times[a] == null || times[b] == null) continue;
    const bad = eqOk ? times[a] > times[b] : times[a] >= times[b];
    if (!bad) continue;
    for (const p of [a, b]) {
      if (!assigned[p] || !assigned[p].time24) continue;
      assigned[p].confidence = assigned[p].confidence / 2;
      assigned[p].status = _statusFromConf(assigned[p].confidence);
      if (assigned[p].status === 'unread') {
        assigned[p].time24 = null;
        assigned[p].reason = 'low-confidence';
      }
    }
  }

  const current = opts.current;
  const rowsOut = SCAN_PRAYERS.map((p) => {
    const row = assigned[p] || _makeUnread(p, { reason: 'missing' });
    if (!row.display && row.status === 'unread') return row;
    if (row.reason === 'no-windows' && !row.time24) return row;
    return scoreScanRow(row, { windows, current, boardIs24h });
  });

  return {
    rows: rowsOut,
    extras: extraDisplays,
  };
}

function normalizeTimetableScan(reading, opts) {
  if (typeof opts === 'string' || opts == null) {
    opts = { clientLocalTime: opts };
  }

  const calibrated = calibrateOnClock(reading, opts.clientLocalTime);
  const rowsIn = calibrated.rows || [];
  const timeRows = rowsIn.filter((r) => r.kind === 'time');
  let clockRow = calibrated.clockMatched ? calibrated.clockRow : null;
  if (!opts.clientLocalTime) {
    const medTimeH = _median(timeRows.map((r) => r.digitHeight || 0));
    clockRow = rowsIn.find((r) => r.kind === 'clock')
      || rowsIn.find((r) => (r.digitHeight || 0) >= 1.3 * medTimeH);
  }
  let boardClock = clockRow ? resolveBoardClock(clockRow.display, opts.clientLocalTime) : null;
  if (boardClock && clockRow && clockRow.confidence != null) {
    boardClock = { ...boardClock, confidence: clockRow.confidence };
  }
  if (opts.clientLocalTime && !calibrated.clockMatched) boardClock = null;

  const boardIs24h = rowsIn.some((r) => r.hh > 12);
  const { rows, extras } = assignRowsToPrayers(timeRows, opts.windows ?? null, {
    today: opts.today,
    boardIs24h,
    current: opts.current,
  });
  _applyColourMismatch(rows, _currentPrayer(opts.windows, opts.clientLocalTime));

  const timings = {};
  const unread = [];
  for (const row of rows) {
    if (row.status === 'ok' || row.status === 'flag') {
      if (row.prayer === 'jummah') timings.jummah = [row.time24];
      else timings[row.prayer] = row.time24;
    } else {
      unread.push(row.prayer);
    }
  }

  const five = rows.filter((r) => r.prayer !== 'jummah');
  const okCount = five.filter((r) => r.status === 'ok').length;
  const quality = okCount / 5;
  const anyFlag = rows.some((r) => r.status === 'flag');
  const anyUnreadFive = five.some((r) => r.status === 'unread');
  const anyFilled = rows.some((r) => r.status === 'ok' || r.status === 'flag');
  let confidence = 'high';
  if (!anyFilled || anyUnreadFive) confidence = 'low';
  else if (anyFlag) confidence = 'medium';

  return {
    boardClock,
    timings,
    rows,
    unread,
    extras,
    confidence,
    quality,
    stats: {
      ms: reading.stats && reading.stats.ms,
      medianDigitHeight: reading.stats && reading.stats.medianDigitHeight,
      warped: !!(reading.panel && reading.panel.warped),
      is24h: boardIs24h,
      clockMatched: !!calibrated.clockMatched,
      calibration: calibrated.calibration || { matched: !!calibrated.clockMatched },
    },
  };
}

// Viewfinder bracketing: the capture module returns a dark MAX composite
// plus an optional one-stop-brighter `alternate`. The reader decides
// whether the bright burst is worth decoding, and which result to keep.
function shouldTryBracket(result) {
  if (!result) return true;
  const matched = !!(result.stats && result.stats.clockMatched);
  const quality = typeof result.quality === 'number' ? result.quality : 0;
  return !matched || quality < 0.6;
}

function _okRowCount(result) {
  return (result && Array.isArray(result.rows) ? result.rows : [])
    .filter((r) => r.status === 'ok').length;
}

function chooseScanResult(dark, bracket) {
  if (!bracket) return dark;
  const darkMatch = !!(dark && dark.stats && dark.stats.clockMatched);
  const bracketMatch = !!(bracket.stats && bracket.stats.clockMatched);
  if (darkMatch !== bracketMatch) return darkMatch ? dark : bracket;
  const dq = typeof dark?.quality === 'number' ? dark.quality : 0;
  const bq = typeof bracket.quality === 'number' ? bracket.quality : 0;
  if (bq !== dq) return bq > dq ? bracket : dark;
  return _okRowCount(bracket) > _okRowCount(dark) ? bracket : dark;
}

// "Nothing read" is no row the user can review — not "no ok rows".
// A clock mismatch caps every row to `flag` (quality 0) but the amber
// fields are still readings.
function scanHasAnyReading(result) {
  const rows = result && result.rows;
  if (!Array.isArray(rows) || !rows.length) return false;
  return rows.some((r) => r.status === 'ok' || r.status === 'flag');
}

/**
 * Compact extras for POST /api/submissions from the live scan/submit state.
 * Always includes source (`photo` | `manual`) and captureLocation when a
 * GPS fix is on the state. Photo states also include a compact scan object.
 */
function buildScanSubmissionExtras(scanState) {
  const extras = { source: scanState && scanState.source === 'photo' ? 'photo' : 'manual' };
  if (scanState && scanState.captureLocation) extras.captureLocation = scanState.captureLocation;
  if (extras.source !== 'photo') return extras;
  const stats = scanState.stats && typeof scanState.stats === 'object' ? scanState.stats : {};
  const cap = stats.capture && typeof stats.capture === 'object' ? stats.capture : {};
  const dark = cap.dark && typeof cap.dark === 'object' ? cap.dark : {};
  extras.scan = {
    clockMatched: !!stats.clockMatched,
    calibrationThreshold: stats.calibration && stats.calibration.threshold,
    quality: scanState.quality != null ? scanState.quality : stats.quality,
    confidence: scanState.confidence != null ? scanState.confidence : stats.confidence,
    capture: {
      source: cap.source || dark.source,
      frames: cap.frames != null ? cap.frames : dark.frames,
      chosen: cap.chosen,
    },
  };
  return extras;
}

/** Drop the photo-source marker on the submit form (used by clearScanSummary). */
function clearScanSourceMarker(form) {
  if (!form || !form.dataset) return;
  delete form.dataset.scanSource;
}

function keeperSourceHint(m) {
  if (!m?.effectiveKeeperId) return '';
  const tx = (key, fallback, params) => window.i18n?.t(key, params) ?? fallback;
  const locale = window.i18n?.current?.() || undefined;
  const updated = m.effectiveKeeperUpdatedAt
    ? new Date(m.effectiveKeeperUpdatedAt).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
    : '';
  if (m.preferredKeeperId === m.effectiveKeeperId) {
    return updated
      ? tx('keeper.hint.tapChangeUpdated', `Tap to change · Updated ${updated}`, { date: updated })
      : tx('keeper.hint.tapChange', 'Tap to change keeper');
  }
  if (m.effectiveKeeperIsCurrentSchedule) {
    if (m.effectiveKeeperIsVerifiedSchedule) {
      return updated
        ? tx('keeper.hint.verifiedUpdated', `Verified schedule · Updated ${updated}`, { date: updated })
        : tx('keeper.hint.verified', 'Verified schedule');
    }
    return updated
      ? tx('keeper.hint.currentUpdated', `Current schedule · Updated ${updated}`, { date: updated })
      : tx('keeper.hint.current', 'Current schedule');
  }
  if (m.effectiveKeeperSource === 'prayerSchedule') {
    return updated
      ? tx('keeper.hint.historyUpdated', `Schedule history · Updated ${updated}`, { date: updated })
      : tx('keeper.hint.history', 'Schedule history');
  }
  return updated
    ? tx('keeper.hint.topUpdated', `Top trusted · Updated ${updated}`, { date: updated })
    : tx('keeper.hint.top', 'Top trusted');
}

window.JAMAT_RENDER = {
  scanTimingsDiff, scanDriftDescriptor,
  parseBoardClock, toPrayerTime24, resolveBoardClock,
  assignRowsToPrayers, normalizeTimetableScan, calibrateOnClock, scoreScanRow, SCAN_PRAYERS,
  shouldTryBracket, chooseScanResult, scanHasAnyReading,
  buildScanSubmissionExtras, clearScanSourceMarker,
  el, renderCard, renderTimingsTable, renderAmenities, renderKeeper,
  computeNextPrayer, computeNextJummah, clockParts, fmtDistance, fmt12, timingsFromMosque,
  normalizePrayerTime, normalizeSubmittedPrayerTime, defaultSubmittedPrayerTime, timingForPrayer,
  jummahTimesForTimings, orderedTimingKeysForDate,
  prettifyMosqueName, prettifyPersonName, isPlaceholderField, isTestFixture,
  keeperSourceHint,
  PRAYER_LABEL, PRAYER_ORDER, prayerOrderForDate,
};
