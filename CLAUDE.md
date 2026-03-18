# TankGauge v2

GitHub: https://github.com/ckrohg/TankGauge-v2

Propane tank monitoring dashboard. Scrapes tank data from tankfarm.io via Puppeteer + OpenAI Vision, stores in Supabase, displays analytics.

## Architecture

Split full-stack: React/Vite frontend + Express API + Supabase (DB + Auth).

```
web/     → React 18 + Vite + Tailwind + shadcn/ui + Recharts + React Query
api/     → Express + Puppeteer + OpenAI + Drizzle ORM + node-cron
supabase/ → Migrations (001_initial.sql, 002_tank_shares.sql)
```

## Deployment

### Frontend (Vercel)
- URL: https://tankguage.vercel.app
- Project: `tankguage`
- Vercel Project ID: `prj_XJD3rIrPOXy99m4ME14oDty4mb1C`
- Org ID: `team_Ye4I8IG4xqOHvOX3Cf9wMTDm`
- Build: `npm run build` → Vite outputs to `web/dist/`
- Env vars (Production only): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`
- SPA routing via `web/vercel.json` (rewrites all to index.html)

### API (Railway)
- URL: https://tankgauge-production.up.railway.app
- Project: TankGauge
- Service: TankGauge
- Railway Project ID: `c0c06932-8b14-445c-8fa8-4a58cafef1d2`
- Railway Service ID: `1467d407-232f-4086-80f0-8e12eea74061`
- Build: Dockerfile (node:20-slim + Chromium for Puppeteer)
- Health check: `GET /health` (30s timeout)
- Restart policy: on_failure, max 3 retries
- Env vars: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CORS_ORIGINS`, `PORT`
- CLI: `railway service TankGauge` to link, then `railway variables` to view/edit

### Supabase
- Project URL: https://yuyoenfomyfxsnxwecsn.supabase.co
- DB pooler: `postgresql://postgres.yuyoenfomyfxsnxwecsn:[pw]@aws-1-us-east-1.pooler.supabase.com:6543/postgres` (transaction mode, 2-min statement timeout)
- Auth: Email + password, JWT verified server-side via service role key
- RLS: All tables enforce `auth.uid() = user_id` (or `owner_id` for shares)
- Tables: `settings`, `tank_readings`, `deliveries`, `payments`, `tank_shares`

## Key Files

| Purpose | Path |
|---------|------|
| Schema (Drizzle) | `api/src/schema.ts` |
| DB connection | `api/src/db.ts` |
| Storage/queries | `api/src/storage.ts` |
| API routes | `api/src/routes.ts` |
| Auth middleware | `api/src/middleware/auth.ts` |
| Scraper | `api/src/services/tankfarm-scraper.ts` |
| Scheduler | `api/src/services/scheduler.ts` |
| Cost calculator | `api/src/utils/cost-calculator.ts` |
| Dashboard | `web/src/pages/Dashboard.tsx` |
| Settings | `web/src/pages/Settings.tsx` |
| Tank gauge | `web/src/components/TankGauge.tsx` |
| Charts | `web/src/components/Charts/` (TankLevelChart, PriceChart, ConsumptionChart, MonthlyCostChart) |
| Tables | `web/src/components/Tables/` (ConsumptionTable, DeliveryHistoryTable, PaymentHistoryTable) |
| Supabase client | `web/src/lib/supabase.ts` |
| Query client | `web/src/lib/queryClient.ts` |
| Auth hook | `web/src/hooks/useAuth.ts` |

## Dev Commands

```bash
# Frontend
cd web && npm run dev          # Vite dev server on :5173

# API
cd api && npm run dev          # tsx watch on :3001

# DB
cd api && npm run db:push      # Push Drizzle schema to DB

# Deploy — MUST run from the correct subdirectory
npx vercel --prod              # Deploy frontend (from repo root — Vercel root dir is set to web/)
cd api && railway up --service TankGauge  # Deploy API (from api/)

# Vercel
cd web && npx vercel env ls    # List env vars

# Railway
railway service TankGauge      # Link service (run once)
railway variables              # View env vars
railway logs                   # View logs

# DB queries (use transaction pooler)
psql "$DATABASE_URL" -c "SELECT ..."
```

**Important deploy notes:**
- Vercel CLI must run from repo root — Vercel project root directory is configured to `web/`
- Railway CLI must run from `api/` — deploying from root causes "Error creating build plan with Railpack"
- Git author email must be `ckrohg@me.com` (set via `git config user.email`), otherwise Vercel rejects the deploy

## Data Collection Notes

- Scraping frequency: configurable (hourly, twice-daily, daily, weekly). Currently set to `twice-daily`.
- Scraper uses Puppeteer to log into tankfarm.io, screenshot the dashboard, then OpenAI Vision to extract values.
- Data: 389 readings since Nov 9, 2025 across 111 unique days (as of Mar 13, 2026).
- Known gap days (13 total): Nov 22-23/25, Dec 2-4/14, Jan 27-31 + Feb 2. Likely caused by Railway restarts or tankfarm.io downtime.

### Scraping Behavior (twice-daily)

The scheduler runs a cron every 30 minutes checking for due users. For `twice-daily`, two windows are used:
- **Morning**: 6:38 AM UTC (window=morning, offset=38min)
- **Evening**: 6:38 PM UTC (window=evening, offset=38min)

**Deduplication**: Readings are deduplicated by `tankfarmLastUpdate` timestamp. If tankfarm.io hasn't updated since the last scrape, the reading is skipped. In practice, **tankfarm.io only updates once per day** (typically late afternoon/evening UTC), so:
- Morning scrape runs but sees unchanged `tankfarmLastUpdate` → skipped as duplicate
- Evening scrape finds new data → saved

This results in 1 reading/day despite `twice-daily` setting. This is correct behavior — no data is lost since market prices are also identical between scrapes. Both scrapes execute successfully; only the evening one has new data to save.

### Schedule Config (in `settings` table)

- `schedule_window`: which window the user's first scrape falls in (morning/evening)
- `schedule_offset_minutes`: minutes after the window start (0-179)
- `schedule_seed`: deterministic seed from user ID for consistent scheduling across restarts

## Analytics & Chart Notes

### Consumption Calculation
- `calculateDailyConsumption` compares consecutive readings; only produces entries when `remainingGallons` drops (positive consumption). Uses Weighted Average Cost (WAC) for pricing.
- `calculateDailyConsumptionFilled` wraps the above but fills in zero-consumption days across the full readings date range, so charts show a continuous timeline.
- Weekly and monthly aggregations also fill in all periods in the date range, including zero-consumption ones.

### Tank Gauge Resolution
- Tankfarm.io reports gallons in ~1 gal increments. At low usage (~0.5 gal/day), many consecutive days show identical `remainingGallons`. This is normal — consumption is real but below gauge resolution.

### Average Usage / Days Until Empty
- Uses **calendar days** (first reading to last reading) as the denominator, not "days with consumption." This is critical because the gauge only detects drops every few days. Using consumption-day count would wildly overstate usage (e.g., 2.9 vs 0.5 gal/day).

### Relative % Gauge
- Outer ring: absolute tank % (0-80% safe fill range)
- Inner ring: relative % of max recorded gallons (historical high-water mark)
- `GET /api/readings/max-gallons` returns the all-time max `remainingGallons` for the user

## Tank Sharing

Users can invite others to view their tank data via Settings > Share Tank Access.

### How it works
1. Owner enters an email and clicks invite → creates `tank_shares` row with status `pending` + sends Supabase invite email (`supabaseAdmin.auth.admin.inviteUserByEmail`)
2. Invited user clicks link in email, signs up, and on first login `GET /api/settings` auto-activates the share (matches email)
3. Shared user's data endpoints resolve via `getEffectiveUserId()` — if no own tank configured, shows the shared owner's data
4. Owner can revoke access anytime from Settings

### API Endpoints
- `GET /api/shares` — list own shares + shares with me
- `POST /api/shares` — invite by email (body: `{ sharedEmail }`)
- `DELETE /api/shares/:id` — revoke a share

### Data Access
- All data endpoints (readings, deliveries, payments, analytics) use `getEffectiveUserId()` which checks: if user has own tankfarm credentials → use own ID; otherwise check for active shares → use shared owner's ID
- Shared users get read-only access (cannot trigger scrapes or modify settings)
