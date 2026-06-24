# Crystal-Ball — Market Event Forecasting Plan

> A planning document for **Crystal-Ball**, a tool that forecasts upcoming
> events likely to move financial markets, presents them on an **interactive
> timeline** with **probability-weighted potential outcomes**, and lets the
> user **select assets** to see which events matter to them — based on both
> obvious structural links and historical statistical correlation.

**Status:** Draft v0.3 · **Owner:** josh99smith · **Last updated:** 2026-06-24

**Decisions locked (this revision):**
- **v1 asset universe:** US index + megacap tickers, US rates/USD, gold, crude,
  BTC — *expand later*.
- **Data:** free / publicly available APIs only for now; **real-time where the
  free tier allows** (truly real-time for crypto; typically delayed/rate-limited
  for equities).
- **Timeline:** multi-scale — **daily, weekly, monthly, quarterly, annual, and
  decade** horizons (see §2.4).

---

## 1. Vision

Markets move on events: central-bank decisions, economic data releases,
earnings, elections, OPEC meetings, geopolitical shocks, options expiry. Most
of these are **known in advance** — what's uncertain is the *outcome* and the
*reaction*.

Crystal-Ball maps the road ahead. For any asset (or basket), it shows:

- **What's coming** — a timeline of scheduled and anticipated market events.
- **What might happen** — each event broken into weighted potential outcomes.
- **Why it matters to *you*** — filtered to the assets you hold or watch, with
  the strength of each event→asset link shown explicitly.

The product is **decision support, not advice**: calibrated scenarios and
evidence, never "buy/sell" calls.

## 2. The Three Pillars (core requirements)

### 2.1 Timeline visual with weighted outcomes
A horizontal time axis (now → forward). Each event is a node placed at its
date, sized by expected impact and colored by category. Expanding a node
reveals its **outcome branches** — a small fan of mutually-exclusive scenarios,
each with a **probability weight** and a **directional impact** on correlated
assets.

```
 NOW ───●──────────●────────────●──────────────●──────────►  time
       CPI       FOMC         NVDA ER        OPEC
       │          │             │              │
       ├ Hot 30% ↓ equities, ↑ USD, ↓ gold
       ├ Inline 50% → muted
       └ Cool 20% ↑ equities, ↓ USD, ↑ gold
```

### 2.2 Asset selector
The user picks assets or asset **types** (e.g. SPX, gold, crude, US 10Y, USD,
BTC, a specific ticker, or a whole class like "energy equities"). The timeline
then filters/ranks events by relevance to that selection.

### 2.3 Event → asset correlation (two tiers)
Every event is linked to assets through:
- **Structural / obvious links** — curated rules (FOMC → rates, USD, gold;
  OPEC → crude, energy; an earnings event → that ticker + its sector ETF).
- **Historical / statistical links** — measured from how the asset actually
  reacted to past instances of that event type (sign, magnitude, hit rate).

Each link carries a **strength score** and a label of which tier it came from,
so the user can tell "obvious" from "data-says."

### 2.4 Multi-scale timeline horizons
The timeline is **zoomable across six scales**, each surfacing the events and
patterns that matter at that resolution:

| Scale | Default window | What dominates |
|-------|----------------|----------------|
| **Daily** | next ~5 days | data releases, single-name earnings, EIA, expiry day |
| **Weekly** | next ~4 weeks | FOMC week, jobs week, earnings clusters, OpEx |
| **Monthly** | next ~3 months | full FOMC/CPI/NFP cycle, earnings season, quarterly expiry |
| **Quarterly** | next ~4 quarters | GDP, quarter-end rebalances, guidance, elections |
| **Annual** | next ~2–3 years | elections, policy regimes, annual cycles, halvings |
| **Decade** | ~10 years | cyclical/structural patterns: rate & business cycles, recession odds, presidential cycle, BTC ~4yr halving rhythm |

At short scales, nodes are **discrete scheduled events** with weighted outcome
fans (§2.1). At the **annual/decade** scales the view shifts toward **cyclical
and probabilistic bands** (e.g. recession-probability over the cycle, rate-cycle
phase, recurring seasonal/halving rhythms) rather than precise dated events —
shown as confidence bands and recurring markers, still asset-filtered.

## 3. What Counts as a Market Event

| Category | Examples | Typically correlated assets |
|----------|----------|-----------------------------|
| **Monetary policy** | FOMC, ECB, BoJ, BoE decisions & minutes | Rates/bonds, USD & FX, gold, equities |
| **Economic data** | CPI, PCE, NFP/jobs, GDP, PMI, retail sales | Bonds, USD, equities, gold |
| **Earnings** | Single-name & sector heavyweights | The ticker, sector ETF, suppliers/peers |
| **Commodity / energy** | OPEC+, EIA inventories, weather | Crude, nat gas, energy equities |
| **Political** | Elections, debt ceiling, legislation, tariffs | Broad indices, FX, sector rotation |
| **Geopolitical** | Conflict, sanctions, supply shocks | Oil, gold, defense, safe-haven FX |
| **Crypto** | ETF flows, regulation, halving, unlocks | BTC, ETH, crypto-linked equities |
| **Market structure** | Options/futures expiry (OpEx, triple witching), index rebalances | Index level, volatility (VIX), affected names |

## 4. Architecture (High Level)

```
   ┌──────────────────┐    ┌──────────────┐    ┌────────────────────┐
   │ Event Ingestion  │ →  │  Normalizer  │ →  │  Event Store        │
   │ • econ calendars │    │ (common      │    │ (scheduled +        │
   │ • earnings cals  │    │  Event       │    │  anticipated        │
   │ • mkt structure  │    │  schema)     │    │  events, timeline)  │
   │ • news/geopol    │    └──────────────┘    └─────────┬──────────┘
   └──────────────────┘                                  │
                                                          │
   ┌──────────────────┐    ┌──────────────────────┐      │
   │ Market Data       │ → │ Correlation Engine    │ ◄────┤
   │ • historical px   │   │ • structural rule map │      │
   │ • event-study     │   │ • historical event    │      │
   │   reaction sets   │   │   study (react stats) │      │
   └──────────────────┘   └───────────┬───────────┘      │
                                       │                  │
                          ┌────────────▼──────────────────▼─────────┐
                          │  Scenario / Outcome Engine               │
                          │  • enumerate outcomes per event          │
                          │  • weight (market-implied + consensus +  │
                          │    Claude reasoning), calibrate          │
                          │  • map each outcome → per-asset impact    │
                          └────────────────────┬─────────────────────┘
                                               │
                       ┌───────────────────────▼────────────────────────┐
                       │  Web App                                        │
                       │  • Timeline visual (weighted outcome fans)      │
                       │  • Asset selector + relevance filter/ranking    │
                       │  • Event detail: scenarios, links, evidence     │
                       └─────────────────────────────────────────────────┘
```

### Components
1. **Event Ingestion** — pull scheduled events (economic & earnings calendars,
   expiry/rebalance schedules) and detect anticipated events (news-driven).
2. **Market Data** — historical prices for event-study analysis.
3. **Correlation Engine** — produces event→asset links (structural + historical).
4. **Scenario / Outcome Engine** — enumerates outcomes, assigns weights, maps
   each to per-asset directional impact.
5. **Web App** — the timeline, asset selector, and event detail surfaces.

## 5. Data Model (draft)

```json
// Event
{
  "id": "evt_2026q3_cpi_jul",
  "title": "US CPI (June)",
  "category": "economic-data",
  "scheduled_at": "2026-07-10T12:30:00Z",
  "is_scheduled": true,            // false = anticipated/uncertain timing
  "expected_impact": 0.78,         // 0–1 magnitude prior
  "outcomes": [
    {
      "id": "hot",
      "label": "Above consensus (hot)",
      "weight": 0.30,              // probability
      "weight_source": "consensus+implied",
      "asset_impacts": [
        {"asset": "SPX", "direction": "down", "magnitude": "med"},
        {"asset": "USD", "direction": "up",   "magnitude": "med"},
        {"asset": "GOLD","direction": "down", "magnitude": "low"}
      ]
    }
    // ... inline, cool
  ]
}

// Event→Asset link (correlation)
{
  "event_type": "us-cpi",
  "asset": "SPX",
  "tier": "historical",            // "structural" | "historical"
  "strength": 0.64,                // 0–1
  "stats": { "n": 36, "avg_abs_move_pct": 0.9, "direction_hit_rate": 0.71 }
}
```

## 6. Scenario Weighting — where the probabilities come from

Weights must be **honest and sourced**, not vibes:

1. **Market-implied** (preferred when available)
   - Rate decisions → fed funds / overnight-index futures implied probabilities.
   - Single-name earnings → options-implied move (straddle) for magnitude.
2. **Consensus / distribution** — economist forecast ranges for data releases.
3. **Historical base rates** — frequency of each outcome type historically.
4. **Claude reasoning layer** — synthesizes the above into a coherent scenario
   set with weights, using **structured output**, and writes a short rationale.
   It blends sources rather than inventing numbers; every weight cites its
   basis. Default to the latest capable model (e.g. `claude-opus-4-8`).
5. **Calibration** — score past weighted predictions vs. realized outcomes;
   surface reliability per category so "30%" means ~30%.

## 7. Correlation Engine — the asset-selector backbone

- **Structural map (curated):** a maintained ruleset of event-type → asset-class
  links that are economically obvious. Fast, explainable, high precision.
- **Historical event study (computed):** for each (event type, asset), measure
  the price reaction over a window around past occurrences → sign, average
  absolute move, and direction hit-rate → a **strength score**.
- **Relevance ranking:** when the user selects assets, rank/filter timeline
  events by max link strength to the selection, badged by tier so the user
  knows whether a link is "obvious" or "historically observed."

## 8. Roadmap (phased)

### Phase 0 — Foundations (1 week)
- Repo scaffolding, CI, `Event` / `Outcome` / `Link` schemas.
- Provider abstraction layer; ingest **FRED release-dates** (economic calendar)
  end-to-end as the first free source.

### Phase 1 — Timeline MVP (1–2 weeks)
- Web app with a read-only, **zoomable multi-scale timeline** (daily → decade,
  §2.4) of scheduled events.
- Static structural correlation map + asset selector (filter by relevance) for
  the v1 asset universe.
- Add free crypto (CoinGecko/Binance, real-time) + earnings calendar (Finnhub).
- Event detail panel (no weighted outcomes yet).

### Phase 2 — Weighted outcomes (1–2 weeks)
- Scenario engine: enumerate outcomes; ingest market-implied + consensus inputs.
- Claude reasoning layer for weighting + rationale (structured output).
- Render the weighted outcome fans on the timeline.

### Phase 3 — Historical correlation (1–2 weeks)
- Market-data ingestion + event-study pipeline → historical link strengths.
- Merge structural + historical links; show tier badges and stats.

### Phase 4 — Calibration & breadth
- Calibration scoring + reliability surface; more event categories & assets;
  anticipated (non-scheduled) event detection from news.

## 9. Tech Stack (proposed)

- **Frontend:** React + TypeScript; timeline/scenario viz with **D3** or
  **visx** (custom timeline with expandable outcome fans).
- **Backend:** TypeScript/Node service for ingestion, correlation, scenarios.
- **LLM:** Claude API (Anthropic SDK), structured output via tool use, for
  scenario synthesis and weighting rationale.
- **Storage:** Postgres (events, links, prices, predictions); start simpler
  (SQLite) if useful for the MVP.
- **Scheduling:** periodic jobs to refresh calendars, prices, and re-weight.

### Free / public data providers (v1)

| Need | Provider(s) | Notes |
|------|-------------|-------|
| Macro data + **release calendar** | **FRED** (incl. releases & release-dates API), **BLS**, **BEA**, **US Treasury** | Free keys; gov data. FRED's release-dates endpoint gives *upcoming* scheduled releases (CPI, PCE, NFP, GDP, rates). |
| FOMC / central-bank schedule | Fed, ECB, BoJ, BoE published calendars + RSS | Dates are public; scrape/ingest. |
| Earnings / IPO calendar | **Finnhub** (free tier), **Financial Modeling Prep** (free tier), **SEC EDGAR** | Free tiers cover US earnings & IPO dates. |
| Equity / index / FX prices | **Stooq** (free CSV), **Alpha Vantage** (free key, rate-limited), **Finnhub** (free tier), **yfinance**/Yahoo (unofficial) | Equity "real-time" on free tiers is usually delayed (~15 min) / rate-limited. |
| Crypto prices | **CoinGecko** (no key) , **Binance** public API | **Genuinely real-time & free.** |
| News / geopolitical events | **GDELT** (free, near real-time), central-bank & gov RSS | For anticipated, non-scheduled events. |
| Market structure (OpEx, triple witching, rebalances) | *computed from calendar rules* | No API needed (e.g. 3rd-Friday logic). |

**Known free-data gaps (handle gracefully):**
- **Market-implied probabilities** (CME FedWatch-style fed-funds odds,
  options-implied straddles) are not cleanly available free in real time. v1
  approximates: derive rate odds from Treasury/fed-funds futures proxies where
  possible, otherwise fall back to **consensus + historical base rates** for
  weighting (§6) and clearly label the weight source.

> Providers are recommendations — confirm before Phase 0. All are free-tier;
> we abstract behind a provider interface so paid/real-time sources can drop in
> later without touching the rest of the system.

## 10. Risks & Principles

- **Not financial advice.** Crystal-Ball presents calibrated scenarios and
  evidence; it never issues trade recommendations. Clear disclaimer in UI.
- **Honest probabilities.** Every weight cites a source; calibration is a
  first-class, measured feature.
- **Correlation ≠ causation.** Historical links are shown with sample size and
  hit-rate so users can judge reliability; weak/low-`n` links are flagged.
- **Data licensing.** Market & calendar data terms must allow our use/display.
- **Regime change.** Historical correlations decay; weight recent data and show
  recency. Avoid overfitting to small samples.

## 11. Success Metrics

- **Outcome calibration (ECE):** stated vs. realized outcome probabilities.
- **Correlation precision:** do flagged event→asset links show the predicted
  reaction sign out-of-sample?
- **Coverage:** % of actual market-moving events that appeared on the timeline
  beforehand, and median lead time.
- **Usefulness:** % of surfaced events users mark relevant for their assets.

## 12. Decisions & Open Questions

**Resolved**
- ✅ **Asset universe (v1):** US index + megacaps, US rates/USD, gold, crude,
  BTC — expand later.
- ✅ **Data:** free/public APIs only for now; real-time where free tiers allow.
- ✅ **Timeline:** multi-scale — daily, weekly, monthly, quarterly, annual,
  decade.

**Still open**
1. **Weighting emphasis** — lead with market-implied probabilities where free
   data allows, else consensus + historical base rates? (Proposed: yes.)
2. **Surface** — web app first (proposed), or also alerts/digest later?
3. **Hosting** — local-only dev first, or a hosted deployment from the start?

---

## Next Step

Decisions are locked enough to build. Recommended start: **Phase 0** — scaffold
the repo, define the `Event` / `Outcome` / `Link` schemas and provider
abstraction, and ingest **FRED release-dates** as the first free economic
calendar — then the **Phase 1 multi-scale timeline MVP** with the asset
selector and structural correlation map.
