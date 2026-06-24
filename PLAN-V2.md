# Crystal-Ball — v2 Enhancement Plan

> Phases 0–4 shipped a working, deployed product: a multi-scale timeline of
> market-moving events with weighted outcome fans, two-tier (structural +
> historical) correlation, a reliability scorecard, a digest, a live crypto
> ticker, and free/keyless data (FRED, Finnhub, FOMC, market-structure, GDELT).
>
> **v2 goal:** make every feature deeper and more trustworthy, and give the app
> a real, polished UI. Still free-data-first, still static on GitHub Pages.

**Status:** Draft v2.0 · **Owner:** josh99smith · **Last updated:** 2026-06-24

---

## 1. Themes

1. **Trustworthy probabilities** — move FOMC/earnings weights from heuristics to
   market-implied data; close the calibration loop with persisted, scored
   predictions.
2. **Deeper correlation** — multi-window event studies, outcome-conditional
   reactions, recency/regime weighting, volatility (not just direction).
3. **A real UI** — proper zoom/pan timeline, richer outcome visualization,
   per-asset views, shareable state, mobile + a11y, light/dark.
4. **Breadth** — more assets, more central banks, sectors/ETFs.
5. **Surfaces** — watchlist, alerts, richer digest.
6. **Engineering quality** — tests, lint, data persistence, caching.

---

## 2. Feature enhancements

### 2.1 Data & providers
- **Market-implied FOMC odds** — derive hike/hold/cut probabilities from
  fed-funds futures (CME-style), replacing the heuristic 25/50/25. Source: free
  CME/where available, or approximate from Treasury futures. `weightSource:
  "market-implied"`.
- **Consensus vs actual for econ data** — pull consensus + released value
  (Finnhub/FMP economic calendar) so outcomes resolve to hot/inline/cool and
  calibration can score them.
- **Earnings depth** — `epsEstimate`, options-implied move (straddle) for
  magnitude, post-event actual to resolve beat/miss.
- **More central banks** — ECB, BoJ, BoE decisions (curated dates like FOMC).
- **Bigger asset universe** — sector ETFs (XLE, XLK, SMH), more megacaps,
  VIX/volatility, US2Y, EUR/USD (expand the v1 list per PLAN §12).
- **Provider hardening** — per-provider rate-limit handling, retries, caching of
  price history between runs (commit a price cache to avoid re-fetching).

### 2.2 Correlation engine
- **Multi-window studies** — measure reaction at 1-day, 3-day, and intraday
  (open→close) windows; surface which window the link is strongest in.
- **Outcome-conditional reactions** — reaction *given* hot vs cool (needs
  consensus/actual), so the historical tier informs the per-outcome impacts.
- **Recency & regime weighting** — weight recent occurrences more; optionally
  segment by rate-regime; show an "as-of" recency badge.
- **Volatility, not just direction** — add a realized-vol / expected-move metric
  per link, not only direction hit-rate.
- **Significance** — flag low-`n` / low-confidence links explicitly; add a
  simple p-value / confidence band.

### 2.3 Scenarios & weighting
- **Blended weighting** — combine market-implied (when available) + consensus +
  historical + Claude into a final weight, with a visible provenance breakdown.
- **Confidence on weights** — show a range, not just a point estimate.
- **Per-asset expected move** — quantify magnitude (e.g. ±%) per outcome from the
  event study, beyond low/med/high.

### 2.4 Calibration (close the loop)
- **Predictions ledger** — persist each run's predictions to a committed
  `data/predictions-log.json`; after events pass, resolve outcomes and score.
- **Reliability diagram** — stated vs realized probability per confidence band
  (the real "is 30% actually 30%?" chart), plus Brier/ECE scores.
- **Per-category accuracy** — track and display accuracy by event type over time.

### 2.5 Surfaces
- **Watchlist** — persist selected assets (localStorage) + shareable URL.
- **Alerts** — high-confidence imminent events → optional browser notifications;
  a generated alerts feed (RSS/JSON).
- **Richer digest** — per-asset digest, "this week" vs "today", and a shareable
  digest page; keep `digest.md` for email later.

---

## 3. UI / UX redesign

### 3.1 Timeline (the centerpiece)
- **True zoom & pan** — replace the percentage layout with a real D3/visx scale;
  click-drag to pan, wheel/pinch to zoom, a brush/minimap for context.
- **Smarter density** — clustering at zoomed-out scales (e.g. "3 events" pills
  that expand), better lane packing, collision-aware labels.
- **Decade/annual cyclical bands** — recession-probability band, rate-cycle
  phase, BTC halving rhythm, presidential cycle (PLAN §2.4), not just dots.
- **Outcome fan upgrade** — an actual fan/tree under the selected node with
  per-branch expected move and asset arrows inline.
- **Now-line + today affordances**, hover tooltips, keyboard navigation.

### 3.2 Asset-centric view
- A per-asset page/panel: upcoming events ranked by relevance, the asset's
  historical reactions, and a live/EOD price sparkline (crypto live).

### 3.3 Polish & platform
- **Design system** — tokens, consistent spacing/typography, refined dark theme
  + a light theme toggle.
- **Responsive & mobile** — the timeline and panels work on phones.
- **Accessibility** — full keyboard nav, ARIA roles, focus states, contrast.
- **States** — loading skeletons, empty/error states, error boundary.
- **Shareable state** — encode selected assets / scale / view / selected event in
  the URL.
- **Performance** — virtualize long lists; memoize layout; code-split.

---

## 4. Engineering quality
- **Tests** — Vitest unit tests for the pipeline (event study, scenarios,
  date math, digest) and key components; a smoke test for the SPA.
- **Lint/format** — ESLint + Prettier; run in CI alongside typecheck.
- **CI gate** — typecheck + lint + test must pass before deploy.
- **Data persistence** — commit price cache + predictions ledger so calibration
  accrues across runs (the refresh workflow commits data back).
- **Schema versioning** — version the data bundle so the SPA can guard.

---

## 5. Proposed v2 roadmap (phases)

- **v2.0 — UI foundation:** design tokens/theme, responsive layout, shareable URL
  state, watchlist persistence, loading/empty/error states, a11y pass.
- **v2.1 — Timeline upgrade:** ✅ real zoom/pan timeline (pure React + time-domain
  math — scroll to zoom, drag to pan), density clustering, generalized axis ticks,
  selected-node outcome fan, decade cyclical markers (BTC halvings + US
  elections). Remaining: recession-probability band (needs a data source).
- **v2.2 — Trustworthy weights:** ◑ FOMC hike/hold/cut weighted by a free
  Treasury-rate proxy (3M T-bill vs policy rate) for fed-funds-futures odds, with
  visible provenance on every weight; heuristic fallback when rate data is
  absent. Remaining: consensus/actual for econ-data outcomes (needs a free
  consensus source) and options-implied earnings magnitude.
- **v2.3 — Calibration loop:** ✅ directional predictions ledger — logs implied
  P(up) per event-asset ahead of time, resolves from free prices once events
  pass, and scores into reliability bands + Brier + per-category hit-rate. Ledger
  persists via the published bundle (read prev → republish), accruing across
  runs. Surfaced in the Reliability view. Accrues over time as events resolve.
- **v2.4 — Correlation depth:** ✅ multi-window event studies (intraday open→close,
  1-day, 3-day follow-through) from Stooq OHLC, recency-weighted hit-rate
  (2-yr half-life), expected-move magnitude, and a sample-size significance flag;
  surfaced in the detail panel. Remaining: outcome-conditional reactions (needs a
  free consensus/actual source) and explicit regime segmentation.
- **v2.5 — Breadth & surfaces:** ◑ expanded universe to 20 assets (VIX, US2Y,
  EUR/USD, sector ETFs XLK/SMH/XLE, megacaps GOOGL/AMZN/META/TSLA); added ECB +
  BoJ rate decisions with euro/yen-aware scenarios; wired all new assets into
  correlation + scenarios; earnings now cover 7 tickers. Remaining: asset-centric
  view, alerts, richer per-asset digest.
- **v2.6 — Quality:** ◑ Vitest suite (22 tests across timeline scale, scenarios,
  weighting, calibration, event study, digest); CI gate workflow (typecheck +
  test + build on push/PR); schema versioning with an SPA guard. Remaining:
  ESLint/Prettier and price-cache persistence.

(Order is a recommendation — UI-first so improvements are visible immediately;
data/calibration depth can be reprioritized.)

---

## 6. Risks & principles (unchanged, reinforced)
- **Not financial advice** — calibrated scenarios + evidence only.
- **Honest probabilities** — every weight cites a source; calibration is
  measured and published, not asserted.
- **Free-data first** — degrade gracefully; never fabricate stats as measured.
- **Static-host constraints** — anything heavier (persistence, scoring) runs in
  the Actions pipeline; the SPA stays static.

---

## 7. Open questions / decisions

1. **Priority order** — UI-first (v2.0/2.1) or trust-first (market-implied
   weights + calibration loop)? (Proposed: UI-first for visible wins.)
2. **Timeline library** — visx (lightweight, React-native) vs D3 directly?
   (Proposed: visx.)
3. **Theme** — keep dark-only or add a light theme + toggle? (Proposed: add
   light + system.)
4. **Persistence** — OK for the refresh workflow to commit data back (price
   cache + predictions ledger) to the repo? (Needed for the calibration loop.)
5. **Asset universe expansion** — which to add first? (Proposed: VIX, US2Y,
   sector ETFs XLE/XLK/SMH, EUR/USD.)

## Next step
Pick a starting phase (recommended **v2.0 — UI foundation**) and confirm the
library/theme/persistence choices in §7; then implement incrementally, deploying
after each phase as today.
