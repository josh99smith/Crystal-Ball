# Crystal-Ball — Chart Section Overhaul

> The chart works but is the least-developed surface: a single close-only area
> line with category markers. It ignores the app's theme, throws away data we
> already fetch, and — most importantly — isn't connected to the forecasting
> engine. This plan rebuilds it into the app's flagship view: theme-aware,
> data-rich, navigable, and **showing what the model expects, not just what
> happened.**

**Status:** Draft · **Owner:** josh99smith · **Last updated:** 2026-06-25 ·
**Library:** lightweight-charts v4 (keep; see §5)

---

## 1. Current state (what we're overhauling)

Files: `src/components/AssetChart.tsx`, `src/useChartPrices.ts`,
`src/usePastEvents.ts`, `pipeline/index.ts` (`writeChartPrices`),
`public/data/prices.json`.

What it does today:
- One **close-only area series** per asset (`prices.json` is `{t, c}`), ~250 daily points.
- Category-colored **markers** for past occurrences + future events; circle =
  scheduled, square = anticipated; clustered count; click a future marker → detail.
- Asset switch via a `<select>` in the toolbar; fixed visible range (~1y back + 120d fwd).
- BTC loads live from CoinGecko client-side; other assets come from the pipeline.

Concrete problems:
1. **Not theme-aware (bug).** Colors are hardcoded dark (`textColor: "#8b97b0"`,
   borders `#2a3450`); the v3.0 light/dark toggle has no effect on the chart.
2. **Throws away data.** The pipeline fetches full **OHLC** (and Yahoo returns
   **volume**) but `writeChartPrices` publishes close only — so no candles, no volume.
3. **Rebuilds on every change.** The effect calls `createChart` on each
   data/marker update instead of creating once and updating — heavy and flickers.
4. **Thin event layer.** Marker text is a truncated title; no hover tooltip, no
   outcome odds, no impact, no implied move; clustering just shows a count.
5. **No navigation.** No range presets, no fit/reset, no forward toggle; fixed height.
6. **No price context.** No crosshair tooltip, no legend (last price / change), no a11y.
7. **Disconnected from the engine.** Nothing on the chart shows the weighted
   outcomes, expected move, or calibration the rest of the app is built around.

---

## 2. Goals & principles
- **Theme-aware and responsive** — follows light/dark; fluid height; touch-friendly.
- **Data-rich but honest** — candles/volume where real; clearly label projections
  as scenarios, never predictions; degrade gracefully when a series is missing.
- **Connected to the forecast** — the chart should *show the model's view*: event
  markers with odds, and a forward scenario band from the weighted outcomes.
- **Create-once, update-often** — one chart instance; update data/markers/options.
- **Static-first** — all data precomputed in the pipeline or fetched client-side
  (crypto); no new backend.

---

## 3. Proposed architecture

- **Chart lifecycle:** create the chart once (ref-held `IChartApi`); separate
  effects update series data, markers, theme options, and visible range. Tear down
  only on unmount.
- **Theme:** derive colors from CSS variables / the `useTheme` value and
  `applyOptions` on theme change (no re-create).
- **Data shape (pipeline):** publish `data/prices.json` as
  `{ t, o, h, l, c, v }[]` per asset (keep `c` for back-compat); a slim
  `schemaVersion`-style note so the client can read either shape during rollout.
- **Series modes:** area (default) ⇄ line ⇄ candlestick, chosen client-side from
  the OHLC data; optional volume histogram in a bottom pane.
- **Event layer:** a single marker model fed by past markers + future events, with
  a hover tooltip component (HTML overlay positioned from the crosshair) showing
  the event's category, date, impact, top weighted outcomes, and implied move.
- **Forward overlay:** a projected band series from "now" to the next linked
  event, derived from `expectedMovePct` + the v3.5 confidence interval.

---

## 4. Phased roadmap

- **C0 — Foundation & correctness:** ✅ theme-aware colors via the toggle (fixes
  the hardcoded-dark bug); create-once/update refactor; responsive height; custom
  crosshair tooltip + legend (last price, period change); ARIA + offscreen
  data-summary fallback.
- **C1 — Richer price data:** ✅ `writeChartPrices` publishes OHLC + volume
  (Yahoo volume parsed; `c` kept for back-compat); **candlestick ⇄ area ⇄ line**
  toggle (candles auto-disabled without OHLC); **volume** pane (auto-disabled when
  sparse).
- **C2 — Range & navigation:** ✅ 1M / 3M / 6M / 1Y / ALL presets + a **Forward**
  toggle, in a dedicated range effect; prefs persisted to localStorage.
- **C3 — Event layer:** ✅ marker tooltips (impact, top weighted-outcome odds,
  options-implied move); **category filter chips**; multi-event days listed with
  "+N more"; click → detail.
- **C4 — Forward scenario cone (flagship):** ✅ from "now" to the next linked
  event, a dashed center line at the weighted-outcome **expected move** with a
  dotted ± band from the asset's measured typical reaction (`avgAbsMovePct`).
  Labeled "scenario, not a prediction." Ties the chart to the forecasting engine.
- **C5 — Comparison:** ✅ overlay a second asset **rebased to the main's first
  close** for true relative performance, with a legend readout.
- **C6 — Polish:** ✅ asset switcher grouped by class (optgroups); chart prefs
  persisted; mobile height. Remaining (minor): full URL deep-link of mode/range,
  a searchable combobox, and removing the dead Stooq fallback path.

---

## 5. The one decision: stay on lightweight-charts v4 or move to v5?
v5 changed the series/marker API (`addSeries(AreaSeries, …)`,
`createSeriesMarkers(...)` instead of `addAreaSeries`/`setMarkers`). The overhaul
touches all of that code anyway. **Recommendation:** do C0–C4 on **v4** (lower
risk, current pin), and consider a v5 upgrade as an isolated step before C5/C6 if
we want its multi-pane/primitive ergonomics. Either way it stays MIT and static.

---

## 6. Risks & notes
- **Visual verification:** the sandbox can't render the canvas; rely on build +
  committed data + a screenshot via the run/verify skill against the live site.
- **CI data:** OHLC + volume come from Yahoo (works in CI today); volume is odd or
  absent for some classes (indices, FX, rates) — hide the volume pane when sparse.
- **Bundle:** lightweight-charts is already a dependency; no new heavy deps.
- **Honesty:** the scenario cone must read as a model scenario with a labeled CI,
  never as a forecast line; magnitudes are proxied (MAG_PCT) and must say so.

## 7. Open questions
1. **Default series mode** — area (current look) or candlestick once OHLC ships?
2. **Scenario cone scope** — just the next linked event, or a fan across the next N?
3. **Volume** — include it, or skip given its inconsistency across asset classes?
4. **Comparison** — built into this view (C5), or deferred to the v4.6 asset pages?
5. **Start where?** C0 (fixes the theme bug + rebuild) is the obvious first step.
