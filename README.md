# 🔮 Crystal-Ball

Forecasts upcoming **market-moving events** on a **multi-scale timeline**, with
**probability-weighted outcomes** and **event→asset correlation**. Pick the
assets you care about and see what's coming and what it might do.

See [`PLAN.md`](./PLAN.md) for the full product/engineering plan.

> **Not financial advice.** Crystal-Ball presents calibrated scenarios and
> evidence — never trade recommendations.

## Status

**Phase 4 — Calibration & breadth.** Working today:

- **Reliability** view: an event-study scorecard — per event type × asset, the
  same-direction rate, avg |move|, sample size, and strength (asset-filterable).
- **Market-structure** events (monthly OpEx + quarterly triple witching),
  fully computed — real upcoming events with no API key.

Plus from Phase 3:

- Two-tier **event → asset correlation**: curated **structural** links plus a
  **historical** tier from an event study (how each asset actually reacted to
  past occurrences — sample size, avg |move|, same-direction rate). Free,
  keyless price data from **Stooq**; past event dates from **FRED**.

Plus from Phase 2:

- Static **Vite + React** SPA with an **asset selector** and a **zoomable,
  horizontal multi-scale timeline** (daily → decade): events positioned by date,
  sized by impact, colored by category, stacked into lanes, click for detail.
- **Weighted outcome scenarios** per event — a probability **fan** on the
  timeline and a full breakdown (weight, source, rationale, per-asset impact
  arrows) in the detail panel.
- Scenarios from the **Claude API** (structured output) when `ANTHROPIC_API_KEY`
  is set, with a deterministic **heuristic fallback** otherwise.
- An **event detail panel** (date, impact, correlated assets with tier/strength).
- A generated **daily/weekly digest** view (and `digest.md`).
- **Live BTC ticker** fetched client-side (CoinGecko, real-time).
- **Data pipeline** (`pipeline/`) with a provider abstraction and two free
  sources — **FRED** (economic-release calendar) and **Finnhub** (earnings) —
  → static JSON, degrading to sample fixtures without keys.
- A curated **structural correlation map** (event → asset links).
- **GitHub Pages + Actions** deployment (live at the Pages URL).

Historical/statistical correlation (Phase 3) and calibration (Phase 4) come next
per the roadmap in `PLAN.md` §8.

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
