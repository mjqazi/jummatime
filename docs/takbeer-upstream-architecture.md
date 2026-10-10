# System Architecture

## Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER DEVICES                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Mobile  │  │  Tablet  │  │ Desktop  │  │    PWA   │          │
│  │   Web    │  │   Web    │  │   Web    │  │  Offline │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
└───────┼─────────────┼─────────────┼──────────────┼─────────────────┘
        │             │             │              │
        └─────────────┴─────────────┴──────────────┘
                      │
                      ↓
        ┌─────────────────────────────────┐
        │      CDN / Static Hosting       │
        │   (Cloudflare / Vercel)         │
        │  • HTML, CSS, JS                │
        │  • Mosque photos                │
        │  • Map tiles cache              │
        └──────────────┬──────────────────┘
                       │
                       ↓
        ┌─────────────────────────────────┐
        │         API Gateway             │
        │   (HTTPS / Rate Limiting)       │
        └──────────────┬──────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ↓                             ↓
┌───────────────┐            ┌───────────────┐
│  REST API     │            │  WebSocket    │
│  (Express.js) │            │  (Socket.io)  │
│               │            │               │
│ • Auth (JWT)  │            │ • Live updates│
│ • CRUD ops    │            │ • Real-time   │
│ • Validation  │            │   prayer time │
└───────┬───────┘            └───────┬───────┘
        │                            │
        └────────────┬───────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ↓                         ↓
┌──────────────┐        ┌─────────────────┐
│    Redis     │        │   PostgreSQL    │
│   (Cache)    │◄───────┤   + PostGIS     │
│              │        │                 │
│ • Sessions   │        │ CORE TABLES:    │
│ • Hot data   │        │ ├─ users        │
│ • Rate limit │        │ ├─ mosques      │
│ • Real-time  │        │ ├─ schedules    │
└──────────────┘        │ ├─ submissions  │
                        │ ├─ favorites    │
                        │ ├─ reviews      │
                        │ └─ reminders    │
                        └─────────┬───────┘
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
                ↓                 ↓                 ↓
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │ Read Replica │  │ Read Replica │  │   Backups    │
        │  (Geo 1)     │  │  (Geo 2)     │  │  (Daily)     │
        └──────────────┘  └──────────────┘  └──────────────┘
                │
                ↓
        ┌───────────────────────┐
        │   Elasticsearch       │
        │   (Advanced Search)   │
        │                       │
        │ • Full-text search    │
        │ • Faceted filters     │
        │ • Analytics           │
        └───────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      BACKGROUND SERVICES                            │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │  Cron Worker    │  │  Notification   │  │  Data Sync      │   │
│  │                 │  │  Service        │  │  Worker         │   │
│  │ • Prayer        │  │                 │  │                 │   │
│  │   reminders     │  │ • FCM (Push)    │  │ • ES indexing   │   │
│  │ • Expire old    │  │ • SendGrid      │  │ • Mat. views    │   │
│  │   data          │  │   (Email)       │  │ • Analytics     │   │
│  │ • Stats         │  │ • Twilio (SMS)  │  │                 │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                              │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ Google Maps  │  │   Firebase   │  │      S3      │            │
│  │     API      │  │   (FCM/Auth) │  │   Storage    │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### 1. User Finds Nearby Mosques

```
User opens app
      ↓
1. Browser requests location permission
      ↓
2. User grants location → (lat: 31.5204, lng: 74.3587)
      ↓
3. GET /api/mosques/nearby?lat=31.5204&lng=74.3587&radius=5
      ↓
4. API checks Redis cache
      ├─ Hit → Return cached results (5ms)
      └─ Miss ↓
5. Query PostgreSQL with PostGIS:
   SELECT * FROM find_nearby_mosques(31.5204, 74.3587, 5.0)
      ↓
6. PostGIS uses GIST index on location column
   Returns 20 mosques within 5km (15ms)
      ↓
7. Cache results in Redis (TTL: 5 min)
      ↓
8. Return JSON to frontend
      ↓
9. Frontend renders:
   • Mosque markers on map
   • List view with cards
   • Sort by distance
```

**Performance:**
- **Cold (no cache)**: 50-100ms
- **Hot (cached)**: 5-10ms
- **Optimization**: Redis caching + GIST index

### 2. User Sets Default Mosque & Gets Reminders

```
User clicks "Set as Default" on Central Jamia Masjid
      ↓
1. POST /api/users/me/default-mosque
   Body: { mosque_id: "abc-123" }
      ↓
2. API calls: set_default_mosque(user_id, mosque_id)
      ↓
3. Database transaction:
   UPDATE users SET default_mosque_id = 'abc-123'
   INSERT INTO user_favorites (user_id, mosque_id)
   INSERT INTO prayer_reminders (user_id, mosque_id, enabled_prayers)
      ↓
4. Return success
      ↓
5. Frontend updates UI:
   ✓ Shows "✅ Default Mosque" badge
   ✓ Auto-opens timings on next app load

─── Background Process (runs every minute) ───

6. Cron worker queries:
   SELECT * FROM prayer_reminders WHERE is_active = TRUE
      ↓
7. For each reminder:
   • Get mosque's active schedule
   • Calculate next prayer time
   • If (current_time == prayer_time - offset):
     → Queue notification
      ↓
8. Notification Service:
   • FCM → Send push to user's device
   • SendGrid → Send email (if enabled)
   • Twilio → Send SMS (if enabled)
      ↓
9. Record in sent_reminders table (prevent duplicates)
      ↓
10. User receives:
    🔔 "Fajr jamaat in 15 minutes at Central Jamia Masjid"
```

**Reminder Flow Optimization:**
- **Batching**: Process 1000 users per batch
- **Deduplication**: Check sent_reminders before sending
- **Retry Logic**: Retry failed sends 3 times
- **Rate Limiting**: Max 10 SMS/hour per user

### 3. Community Verification Workflow

```
Ahmed submits new timings for Central Jamia Masjid
      ↓
1. POST /api/submissions
   Body: {
     mosque_id: "abc-123",
     timings: { fajr: "05:25", ... },
     notes: "Winter schedule started"
   }
      ↓
2. Create timing_submission record (status: pending)
      ↓
3. Trigger: create_verification_requests_for_submission()
      ↓
4. Query top 5 contributors for this mosque:
   SELECT * FROM user_mosque_contributions
   WHERE mosque_id = 'abc-123'
     AND is_top_contributor = TRUE
   ORDER BY approved_submissions DESC
   LIMIT 5
      ↓
5. For each top contributor:
   INSERT INTO verification_requests (...)
      ↓
6. Send notifications:
   🔔 "New timing update from Ahmed R. - please verify"
      ↓
7. Top contributor (Hassan) receives notification
      ↓
8. Hassan reviews in app:
   Current: Fajr 5:30 AM
   Proposed: Fajr 5:25 AM
      ↓
9. Hassan clicks "✓ Approve & Copy to My Submission"
      ↓
10. POST /api/verification-requests/xyz-789/respond
    Body: {
      action: "approve",
      copy_to_my_submission: true
    }
      ↓
11. Database updates:
    • verification_requests.status = 'approved'
    • timing_submissions.verification_count++
    • timing_submissions.verified_by_contributors += hassan_id
    • timing_submissions.confidence_score += 10
    • Create new submission for Hassan with same timings
      ↓
12. If confidence_score > 80 && verification_count >= 3:
    → Auto-approve submission
    → Update mosque's active schedule
      ↓
13. Notify original submitter (Ahmed):
    ✅ "Your submission was approved by the community!"
```

**Trust Calculation:**
```javascript
// Auto-calculated after each submission
trust_score = 50
  + (approved_submissions × 5)
  - (rejected_submissions × 10)
  + (verifications_given × 2)

// Example:
// User with 10 approved, 1 rejected, 5 verifications
// = 50 + 50 - 10 + 10 = 100 (max)
```

## Geospatial Query Performance

### PostGIS GIST Index Magic

```sql
-- Create spatial index (one-time)
CREATE INDEX idx_mosques_location
ON mosques USING GIST(location);

-- Query: Find mosques within 5km
EXPLAIN ANALYZE
SELECT
    id,
    name,
    ST_Distance(location, ST_MakePoint(74.3587, 31.5204)::geography) / 1000 AS distance_km
FROM mosques
WHERE ST_DWithin(
    location,
    ST_MakePoint(74.3587, 31.5204)::geography,
    5000  -- meters
)
ORDER BY location <-> ST_MakePoint(74.3587, 31.5204)::geography
LIMIT 20;
```

**Query Plan:**
```
Limit  (cost=0.41..8.63 rows=20)
  ->  Index Scan using idx_mosques_location on mosques
      Index Cond: (location && '...')
      Order By: location <-> '...'
      Filter: ST_DWithin(location, '...', 5000)

Execution Time: 15.234 ms
```

**With 1 Million Mosques:**
- ✅ GIST Index: **15ms**
- ❌ Full Table Scan: **45,000ms** (3000x slower!)

### Scaling Strategy

**Geographic Sharding:**

```
Americas DB:
├─ North America mosques
└─ South America mosques

Europe DB:
├─ European mosques
└─ Middle East mosques

Asia DB:
├─ South Asia mosques
├─ Southeast Asia mosques
└─ East Asia mosques

Africa DB:
└─ African mosques
```

**Routing Logic:**
```javascript
function getDBForLocation(lat, lng) {
  if (lat >= -60 && lat <= 75 && lng >= -170 && lng <= -30) {
    return americasDB;
  } else if (lat >= 35 && lat <= 70 && lng >= -10 && lng <= 40) {
    return europeDB;
  } else if (lat >= -10 && lat <= 55 && lng >= 40 && lng <= 150) {
    return asiaDB;
  } else {
    return africaDB;
  }
}
```

## Caching Strategy

### Redis Cache Layers

```
┌─────────────────────────────────────┐
│         L1: Hot Mosques             │
│  Most viewed mosques (top 1000)     │
│  TTL: 1 hour                        │
│  ~50MB                              │
└─────────────────┬───────────────────┘
                  │
┌─────────────────┴───────────────────┐
│      L2: Search Results             │
│  Geospatial query results           │
│  Key: "nearby:{lat}:{lng}:{radius}" │
│  TTL: 5 minutes                     │
│  ~200MB                             │
└─────────────────┬───────────────────┘
                  │
┌─────────────────┴───────────────────┐
│       L3: Prayer Schedules          │
│  Current active schedules           │
│  Key: "schedule:{mosque_id}:{date}" │
│  TTL: Until midnight                │
│  ~100MB                             │
└─────────────────────────────────────┘
```

**Cache Hit Rates:**
- L1 (Hot Mosques): 40-50% hit rate
- L2 (Search Results): 60-70% hit rate
- L3 (Schedules): 90%+ hit rate

**Total Memory: ~350MB** (affordable on most hosting)

### 4. Timetable Photo Scan ("Take a pic")

On-device 7-segment reader. No cloud vision call, no new runtime dependency.

```
Hero card "Take a pic" ──► js/timetable-capture.js viewfinder (getUserMedia, rear camera)
        │                    EV min · manual ~50 ms shutter where supported · ISO min · focus continuous
        │                    tap → 10-frame MAX burst (LED-first) + optional one-stop-brighter alternate
        │                    denied/unavailable → <input type=file capture=environment> fallback
        ▼ js/app.js readAndNormalize(imageData): shared read+normalise for both paths
        │            viewfinder: read dark first; read alternate only if !clockMatched or quality < 0.6
        │            (chooseScanResult: clock match > quality > ok-row count; never blend)
        │            file path: downscaleImageForScan() — createImageBitmap + EXIF; ≤ 2400 px; one image
        ▼ js/timetable-reader.js readTimetable(imageData, { cropLongEdge: 1600 })
        │     luminance (L = max(R,G,B))
        │     locate panel → crop → scale crop to 1600 px
        │     optional inverse-mapped bilinear trapezoid warp
        │     Otsu + peak-relative LED mask
        │     components → digits → rows → colons → H:MM / H:MM:SS grammar
        │     7-segment sample + decode (sparsity prior, stability test)
        │     retry once at cropLongEdge 1920 from the same decoded frame
        │     if medianDigitHeight < 22
        ▼ js/components.js normalizeTimetableScan(reading, { windows, clientLocalTime, today })
        │     confirm clock row vs phone ±20 min; sweep ON threshold on the
        │       clock and re-decode time rows (×0.6 if the clock never matches)
        │     clock AM/PM nearest phone (resolveBoardClock)
        │     assignRowsToPrayers: vertical order in the jamat column;
        │       sun windows validate + 12h→24h (never rewrite digits)
        │     scoreScanRow: S1 digits × S2 window × S3 minutes × S4 change-prior
        │       (Maghrib excluded; Jummah never ok when it differs from current)
        │     soft colour vs current-prayer check (never assigns)
        ▼ { boardClock, timings, rows, unread, extras, confidence, quality, stats }
        │
        ▼ js/app.js applyTimetableScan(): open drawer → submit form
          ok (≥0.8, green) / flag (0.5–0.8, amber "check") / unread (<0.5, raw string)
          Maghrib summary-only; ignored extras listed; user taps Submit
        │
        ▼ existing POST /api/submissions (consensus, reputation, FCM unchanged)
```

On-site path: the client captures a GPS fix for every submission (`navigator.geolocation.getCurrentPosition`, high accuracy, 8 s timeout, 30 s max age) — at shutter for a photo scan, and when the submit form opens for a typed entry — and sends it with `source: 'photo' | 'manual'`. The server measures distance with PostGIS `ST_Distance(location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography)` — never haversine in JS. When the fix is within 200 m and accuracy ≤ 150 m, any source is installed immediately via `installMergedActiveSchedule` (same merge as a current-keeper direct update, `verified`), the submission is stored `approved`/`autoApplied`, and the current effective time keeper gets `notifyKeeperUpdate` plus an inbox `Notification` of type `photo_auto_applied` (photo: "photographed the board"; manual: "updated the times … while there"). Far-away submissions and poor/missing fixes still go through the keeper/consensus path. `recomputeAndPromote` is skipped on that POST so a stale consensus cannot overwrite the just-installed schedule; later submissions still see the auto-applied row as approved.

The only write path for timings stays `POST /api/submissions`, so photo-derived times get the same consensus and keeper-notification treatment as typed ones unless the on-site rule fires. Stages are synchronous pure functions with macrotask yields in the orchestrator so a Web Worker can take the slowest stage later.

## Security Architecture

### Authentication Flow

Email/password sign-up uses the same login modal with an explicit confirmation step. A failed login may call `POST /api/auth/register/preview`, which shares the registration Zod schema and account eligibility checks but never writes to the database or issues a token. The preview uses the login rate limiter; actual registration retains its stricter limiter. Only the user's confirmation calls `/auth/register`, which rechecks eligibility. A missing preview endpoint or failed check must not fall back to creating an account. The Google account-picker flow is unchanged.

```
User logs in
      ↓
1. POST /api/auth/login
   Body: { email, password }
      ↓
2. Verify bcrypt password hash
      ↓
3. Generate JWT tokens:
   • Access Token (15 min expiry)
   • Refresh Token (7 day expiry)
      ↓
4. Return tokens to client
      ↓
5. Client stores:
   • Access token in memory
   • Refresh token in httpOnly cookie
      ↓
6. Subsequent requests include:
   Authorization: Bearer {access_token}
      ↓
7. API middleware verifies JWT signature
      ↓
8. If expired → Use refresh token to get new access token
```

### API Rate Limiting (Redis)

```javascript
// Express middleware
async function rateLimiter(req, res, next) {
  const key = `ratelimit:${req.ip}:${req.path}`;
  const requests = await redis.incr(key);

  if (requests === 1) {
    await redis.expire(key, 60); // 1 minute window
  }

  if (requests > 100) { // Max 100 req/min
    return res.status(429).json({
      error: 'Too many requests'
    });
  }

  next();
}
```

### SQL Injection Prevention

```javascript
// ✅ GOOD: Parameterized queries
const mosques = await prisma.$queryRaw`
  SELECT * FROM find_nearby_mosques(
    ${lat}::double precision,
    ${lng}::double precision,
    ${radius}::double precision
  )
`;

// ❌ BAD: String concatenation
const query = `SELECT * FROM mosques WHERE name = '${userInput}'`;
```

## Monitoring & Observability

### Key Metrics to Track

**Application Metrics:**
```javascript
// Prometheus metrics
mosque_searches_total{region="asia"} 45231
timing_submissions_total{status="approved"} 1829
notification_sends_total{channel="push"} 12845
api_request_duration_seconds{path="/api/mosques/nearby"} 0.045
```

**Database Metrics:**
```sql
-- Slow queries (> 100ms)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC;

-- Table sizes
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(tablename::regclass))
FROM pg_tables
WHERE schemaname = 'public';

-- Index usage
SELECT
  indexrelname,
  idx_scan,
  idx_tup_read
FROM pg_stat_user_indexes;
```

### Alerting Rules

```yaml
alerts:
  - name: HighErrorRate
    condition: error_rate > 1%
    action: Send PagerDuty alert

  - name: SlowQueries
    condition: p95_latency > 500ms
    action: Slack notification

  - name: DatabaseConnections
    condition: active_connections > 80
    action: Auto-scale read replicas

  - name: NotificationFailures
    condition: fcm_failure_rate > 5%
    action: Email dev team
```

## Disaster Recovery

### Backup Strategy

**PostgreSQL:**
```bash
# Daily full backup (3 AM)
pg_dump -Fc jamat_db > backup_$(date +%Y%m%d).dump

# Continuous WAL archiving (Point-in-Time Recovery)
archive_command = 'cp %p /backups/wal/%f'

# Retention:
# - Daily backups: 30 days
# - Weekly backups: 3 months
# - Monthly backups: 1 year
```

**Recovery Time Objective (RTO):** 1 hour
**Recovery Point Objective (RPO):** 5 minutes

### High Availability

```
Primary DB (us-east-1a)
      ↓ Synchronous replication
Standby 1 (us-east-1b)
      ↓ Asynchronous replication
Standby 2 (us-west-2a)

If primary fails:
1. Promote Standby 1 to primary (30 seconds)
2. Update DNS to point to new primary
3. Application reconnects automatically
```

---

**This architecture supports:**
- ✅ Millions of mosques
- ✅ Millions of users
- ✅ Sub-100ms response times
- ✅ 99.9% uptime
- ✅ Global scale
