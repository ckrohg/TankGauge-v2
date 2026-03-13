# TankGauge v2

GitHub: https://github.com/ckrohg/TankGauge-v2

Propane tank monitoring dashboard. Scrapes tank data from tankfarm.io via Puppeteer + OpenAI Vision, stores in Supabase, displays analytics.

## Architecture

Split full-stack: React/Vite frontend + Express API + Supabase (DB + Auth).

```
web/     → React 18 + Vite + Tailwind + shadcn/ui + Recharts + React Query
api/     → Express + Puppeteer + OpenAI + Drizzle ORM + node-cron
supabase/ → Migrations (001_initial.sql)
```

## Deployment

### Frontend (Vercel)
- URL: https://web-hazel-rho-53.vercel.app
- Project: `tankguage` (Vercel project name, note typo)
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
- RLS: All tables enforce `auth.uid() = user_id`
- Tables: `settings`, `tank_readings`, `deliveries`, `payments`

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

# Vercel
cd web && npx vercel env ls    # List env vars
cd web && npx vercel --prod    # Deploy to production

# Railway
railway service TankGauge      # Link service
railway variables              # View env vars
railway logs                   # View logs

# DB queries (use transaction pooler)
psql "$DATABASE_URL" -c "SELECT ..."
```

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
