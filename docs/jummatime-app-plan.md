# JummaTime App Integration

## Product Direction

Same application and shared backend, with Friday congregation discovery as the
primary journey: find a masjid, compare its Jummah sessions, choose a default,
get directions and optionally enable a Friday reminder. Daily prayers, keepers
and contributions remain available, not separate copies of the data.

The existing SEO website stays at the root. The interactive app is under `/app/`
so its assets and PWA scope cannot replace the existing pages accidentally.

## Source Provenance

Upstream: https://github.com/mjqazi/Jamat

- Latest fetched main: `c95d775ef79c7b12efdb08b9cdffe27711d2e8a4`, September 7, 2026.
- Existing variant: `7a5d6a86b582f234b6a8fb58b353afd4ae27ad73`, June 22, 2026.
- Imported frontend: `git merge-tree --write-tree origin/main origin/Jummatime`
  tree `bfc49523493e601ec3f39a3e5164d92dd745981e`, with conflicts resolved here.
- Latest scanner, explicit registration confirmation, inbox reliability and
  effective-timing fixes are preserved. Older hero keeper markup was not restored.
- Locale JSON merges retain new upstream keys and variant discovery copy.
- The original Takbeer checkout's uncommitted changes were not modified.

The backend remains https://takbeertime.com/api. Do not deploy another server or
seed another mosque database for this variant. For future refreshes fetch upstream,
compare these commits, merge frontend changes and rerun the tests; do not blindly
overwrite the snapshot. `takbeer-upstream-architecture.md` is inherited context,
not this repository's deployment topology.

## Local Verification

```powershell
npm --prefix app ci --ignore-scripts
npm --prefix app run test:unit -- --runInBand
npm --prefix app run test:smoke
node scripts/serve.cjs
```

Preview: http://127.0.0.1:4173/ (or `/app/`); Urdu: `/ur/`.

The homepage is the app, not a promotional landing page. Short labels, collapsed
daily tools, no automatic introductory modal and a minimal footer keep discovery
primary. The same template generates all ten localized homepages. Install the
app's development dependencies, then run `node scripts/build.js` after edits to
`app/index.html` or translations. Homepage generation uses jsdom for HTML and
structured JSON parsing rather than copying divergent templates.

Smoke tests use intercepted API fixtures and block writes. They check guest
default selection, missing Jummah, session rollover, directory search, reminder
defaults, metadata/assets and desktop/mobile layouts. Screenshots go into ignored
`.artifacts/`. Live API checks must stay read-only. No test should submit a timing
or create an account in production.

Verified: 356 web unit tests, with Chrome smoke
checks at 1440, 390 and 320 px; the expanded language checks cover all ten locales,
RTL, saved preferences and localized URLs. See test output for the latest count.
The native push suite is excluded because native code is not in this snapshot.
A live, non-authenticated browser search for Multan returned 15 results with no
JavaScript errors, confirming the shared API works from the preview. Account
actions and real notification delivery have not been verified.

## Web Deployment

The existing GitHub Pages site publishes the root of `mjqazi/jummatime`'s `main`
branch to `https://jummatime.com`. Generated pages and the `app/` runtime are
committed directly; Node is required for development/generation, not serving.
`_config.yml` excludes test files, development packages, scripts and internal docs.
After a push, verify the Pages build is `built` for the pushed commit, then check
the live homepage, `/app/`, localized homepages and shared API reads. A successful
static deployment is not proof that auth or notification delivery works.

## Remaining Release Checks

1. Allow `https://jummatime.com` and the canonical www origin in the shared API's
   `ALLOWED_ORIGINS`. An October 10 OPTIONS check of `/api/auth/login` returned
   204 without an allowed-origin header, so cross-origin auth is currently blocked.
2. Authorize JummaTime in Firebase Authentication and test real Google sign-in
   interactively. Reuse shared accounts; do not introduce another Firebase project.
3. Review actual Friday data in target cities and empty/error states on real phones.
4. Review translations with native speakers. Core Friday/discovery copy is now
   translated in all ten supported languages via `app/data/jumma-copy.json`.
   Advanced inherited tools retain their existing locale bundles and English
   fallback for untranslated keys.
5. Switch generated SEO-page CTAs to the local app, add its canonical URL to the
   sitemap and remove the generic 13:00 countdown from pages where it could be
   mistaken for a masjid's actual prayer time. The widget route is updated now;
   existing hard-coded Takbeer links remain deliberately pending publishing.
6. Decide whether native JummaTime packaging remains a separate Play application.
   Its old branch has `com.jummatime.android`; do not reuse Takbeer signing or
   Firebase Android config without matching the package identity.
7. Verify GA4 Realtime after deployment. Do not count localhost preview traffic.

Imported npm packages are development/test tools only. Audit findings should be
reviewed before the next dependency refresh; they are not bundled into the static
runtime. No automatic force-upgrade is part of this import.
