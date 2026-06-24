# 🔮 Crystal-Ball

Forecasts upcoming **market-moving events** on a **multi-scale timeline**, with
**probability-weighted outcomes** and **event→asset correlation**. Pick the
assets you care about and see what's coming and what it might do.

See [`PLAN.md`](./PLAN.md) for the full product/engineering plan.

> **Not financial advice.** Crystal-Ball presents calibrated scenarios and
> evidence — never trade recommendations.

## Status

**Phase 0 — Foundations** (scaffolding). Working today:

- Static **Vite + React** SPA shell with an **asset selector** and a
  **multi-scale** (daily → decade) timeline of upcoming events.
- A **data pipeline** (`pipeline/`) with a provider abstraction and the first
  free source, **FRED** (economic-release calendar) → static JSON.
- A curated **structural correlation map** (event → asset links).
- **GitHub Pages + Actions** deployment wiring.

Weighted outcome scenarios (Phase 2) and historical correlation (Phase 3) come
next per the roadmap in `PLAN.md` §8.

## Architecture (static hosting)

GitHub Pages serves static files only, so the "backend" is a scheduled GitHub
Actions pipeline:

```
GitHub Actions (cron) → ingest → correlate → (later: scenario weighting via Claude)
                      → emit static JSON
                                │ deploy
                                ▼
GitHub Pages (static SPA) → loads prebuilt JSON
                          + live keyless crypto (CoinGecko/Binance) client-side
```

API keys live in **GitHub Actions secrets** and are never shipped to the browser.

## Develop

```bash
npm install
npm run pipeline   # generate public/data/events.json (uses fixtures without keys)
npm run dev        # start the SPA at http://localhost:5173/Crystal-Ball/
```

Other scripts: `npm run build`, `npm run preview`, `npm run typecheck`.

### Data sources & keys

The pipeline degrades gracefully: with no keys it emits **sample fixtures** so
the app still renders. For real data set environment variables (locally in a
`.env`-style export, or as repo secrets in CI):

| Variable | Source | Used for |
|----------|--------|----------|
| `FRED_API_KEY` | https://fred.stlouisfed.org/docs/api/api_key.html | Economic-release calendar |
| `FINNHUB_API_KEY` | https://finnhub.io | Earnings calendar (Phase 1) |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com | Scenario weighting (Phase 2) |

## Deploy (GitHub Pages)

1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Add the API keys above under **Settings → Secrets and variables → Actions**.
3. Push to `main` → `build-and-deploy.yml` builds and publishes.
4. `refresh-data.yml` re-runs on a schedule to keep data fresh.

The Vite `base` is `/Crystal-Ball/` to match the repo-name path on Pages.

## Layout

```
shared/        schema + asset universe (used by SPA and pipeline)
pipeline/      data pipeline ("backend" run in Actions)
  providers/   source abstraction + FRED provider
  correlation/ structural event→asset map
src/           React SPA (asset selector, timeline)
public/data/   generated events.json (consumed by the SPA)
.github/       build-and-deploy + refresh-data workflows
```
