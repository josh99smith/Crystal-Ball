# Crystal-Ball — v3 Plan

> v1 built the forecasting engine; v2 made it deep, calibrated, and charted.
> **v3 turns Crystal-Ball from a dashboard you read into a market-intelligence
> assistant that reasons, personalizes, alerts, and lets you test ideas** — still
> free-data-first, still static on GitHub Pages + Actions (with one explicit
> decision about a tiny serverless helper for interactive AI).

**Status:** Draft v3.0 · **Owner:** josh99smith · **Last updated:** 2026-06-24

---

## 1. Theme

From *"what's coming and what might it do?"* (v1/v2) to *"what does it mean **for
me**, what should I watch, and would acting on it have worked?"* (v3).

Seven pillars:
1. **Intelligence** — Claude-written briefings, narratives, anomaly callouts, and
   natural-language Q&A over the data.
2. **Personalization** — watchlists/portfolios and position-aware event-risk.
3. **Delivery & alerts** — scheduled briefings, alerts, calendar export.
4. **Strategy lab** — backtest "act before event X" rules; expected-value calc.
5. **Deeper/real data** — market-implied probs, consensus/actual, intraday reactions.
6. **Model rigor** — calibration-driven weighting, multi-event control, regimes.
7. **Platform** — PWA, theming/mobile/a11y, shareable deep links, embeds.

---

## 2. Pillars in detail

### 2.1 Intelligence (Claude)
- **Daily/weekly AI brief** — Claude writes a narrative "week ahead" from the
  event/correlation/calibration data, generated in Actions and published static.
- **Per-event narrative** — a short, sourced "what to watch / what it means"
  paragraph per high-impact event (structured + prose).
- **Anomaly callouts** — flag unusual setups (clustered high-impact events, a
  historical link that flipped, calibration drift).
- **Ask-the-Ball (Q&A)** — natural-language questions ("what moves gold next
  month?", "biggest risks for NVDA?"). *Needs runtime inference* → see §4.

### 2.2 Personalization
- **Watchlist / portfolio** — save assets (+ optional weights) in localStorage;
  shareable via URL.
- **Event-risk exposure** — "your portfolio's event risk this week": aggregate
  upcoming events weighted by holdings × impact × correlation.
- **Personalized digest** — the brief, filtered to holdings.

### 2.3 Delivery & alerts
- **Calendar export (.ics)** — subscribe to upcoming events in any calendar
  (fully static — generate an .ics feed).
- **Scheduled email brief** — Actions sends the digest via a free email API
  (Resend/SMTP) on a cron.
- **Alerts** — high-confidence imminent events → browser push (PWA) and/or an
  alerts JSON/RSS feed.

### 2.4 Strategy lab (backtesting)
- **Event-rule backtester** — "buy SPX the day before CPI, sell the day after"
  evaluated over history (uses the published price + event data, client-side).
- **Expected-value calculator** — per event, combine outcome weights × per-asset
  moves into an EV and a payoff distribution.
- **Calibration-aware** — temper EV by the measured reliability of that link.

### 2.5 Deeper & more real data
- **Market-implied probabilities** — fed-funds futures (proper source), options-
  implied straddles for earnings magnitude.
- **Consensus vs actual** — for econ data, to resolve hot/inline/cool and enable
  outcome-conditional reactions + true outcome calibration.
- **Intraday reaction tracking** — finer post-event resolution where free data allows.
- **More assets/classes** — full rate curve, FX majors, more commodities,
  international indices; factor/sector rollups.

### 2.6 Model rigor
- **Calibration-driven weighting** — feed the v2.3 reliability back into stated
  probabilities (shrink toward base rates where the model is overconfident).
- **Multi-event control** — de-overlap reactions when several events share a day.
- **Regime segmentation** — condition correlations on rate/vol regime.
- **Confidence intervals** — show ranges, not just point weights/strengths.

### 2.7 Platform & UX (absorbs v2.0 leftovers)
- **PWA** — installable, offline cache of the last bundle, app icon.
- **Theming** — light/dark/system; **mobile** layout polish; **a11y** pass.
- **Shareable deep links** — encode view/asset/event/scale in the URL.
- **Asset-centric pages** + a **command palette** (jump to asset/event).
- **Embeddable widgets** — a single-event or single-asset embed.

---

## 3. Proposed v3 roadmap

- **v3.0 — Platform base:** ◑ light/dark theme toggle (system-aware, persisted);
  shareable URL state (view/scale/assets/chart in the hash); watchlist
  persistence (localStorage); installable PWA (manifest, icon, offline service
  worker with safe network-first caching). Remaining: deeper mobile/a11y polish,
  asset-centric pages, command palette.
- **v3.1 — Intelligence (static):** Claude daily/weekly brief + per-event
  narratives + anomaly callouts, generated in Actions, published static.
- **v3.2 — Personalization & delivery:** portfolio + event-risk exposure;
  calendar (.ics) export; personalized digest; scheduled email brief.
- **v3.3 — Strategy lab:** client-side event-rule backtester + EV calculator,
  calibration-aware.
- **v3.4 — Deeper data:** market-implied probs, consensus/actual, more assets.
- **v3.5 — Model rigor:** calibration-driven weighting, multi-event control,
  regimes, confidence intervals.
- **v3.6 — Ask-the-Ball:** natural-language Q&A (depends on §4 decision).

---

## 4. The one architectural decision: interactive AI

Most of v3 stays **pure static** (briefs/backtests/exports are precomputed in
Actions or run client-side). The exception is **interactive, runtime AI**
(Ask-the-Ball), which needs an inference call per question — impossible from a
static site without exposing a key. Options:

- **A. Bring-your-own-key (stays static):** user pastes an Anthropic key, stored
  locally; the SPA calls Claude directly. Zero infra; only power users will.
- **B. Tiny serverless proxy:** a Cloudflare Worker / Vercel function holds the
  key and rate-limits. Best UX; adds one small non-static piece + a secret.
- **C. Precomputed only (no live Q&A):** ship briefs/narratives (static) and
  skip free-form Q&A for now.

Recommendation: ship the **static intelligence** (briefs/narratives, §2.1 minus
Q&A) first under C, and revisit A/B for Q&A later.

---

## 5. Principles (unchanged)
- **Not financial advice**; calibrated scenarios + evidence only.
- **Honest probabilities** — every number cites a source; reliability is measured.
- **Free-data-first**; degrade gracefully; never fabricate stats as measured.
- **Static-host by default**; any non-static piece is an explicit, isolated opt-in.

## 6. Open questions
1. **Start where?** v3.0 platform base, v3.1 intelligence, or v3.2 personalization?
   (Proposed: v3.0 — it unblocks the rest and is the most visible.)
2. **Interactive AI (§4)?** Stay static (briefs only) for now, or add a serverless
   proxy for live Q&A?
3. **Email/push delivery** — worth wiring (needs a free email API key in Actions),
   or is the in-app digest + .ics calendar enough?
4. **Portfolio model** — simple watchlist, or weighted positions for real
   exposure math?
