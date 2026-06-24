# Crystal-Ball — Market Event Forecasting Plan

> A planning document for **Crystal-Ball**, a tool that forecasts upcoming
> events likely to move financial markets, presents them on an **interactive
> timeline** with **probability-weighted potential outcomes**, and lets the
> user **select assets** to see which events matter to them — based on both
> obvious structural links and historical statistical correlation.

**Status:** Draft v0.2 · **Owner:** josh99smith · **Last updated:** 2026-06-24

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
- Pick data providers; ingest one calendar (economic) end-to-end.

### Phase 1 — Timeline MVP (1–2 weeks)
- Web app with a read-only timeline of scheduled events.
- Static structural correlation map + asset selector (filter by relevance).
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
- **Data providers (to select):** an economic/earnings calendar API, a market
  price/history API, and rate-futures / options-implied data for weighting.
- **Scheduling:** periodic jobs to refresh calendars, prices, and re-weight.

> Stack & providers are recommendations — confirm before Phase 0. Provider
> choice depends on licensing/cost and how much real-time vs. EOD data we need.

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

## 12. Open Questions

1. **Asset universe for v1** — which markets first? (Proposed: US equities
   indices + megacap tickers, US rates/USD, gold, crude, BTC.)
2. **Data providers & budget** — real-time vs. end-of-day; paid API tolerance?
3. **Weighting emphasis** — lead with market-implied probabilities where they
   exist, falling back to consensus/historical? (Proposed: yes.)
4. **Timeline horizon** — how far forward by default (e.g. next 1–3 months)?
5. **Surface** — web app first (proposed), or also alerts/digest?

---

## Next Step

Confirm the v1 asset universe (Q12.1) and data-provider appetite (Q12.2), then
start **Phase 0**: scaffold the repo and ingest one economic calendar, followed
by the **Phase 1 timeline MVP** with the asset selector and structural
correlation map.
