# Crystal-Ball — v4 Plan

> v1 built the forecasting engine; v2 made it deep, calibrated, and charted; v3
> turned it into a market-intelligence **assistant** (briefs, backtests, model
> rigor, bring-your-own-key Q&A). **v4 turns Crystal-Ball from a dashboard you
> visit into a personalized, proactive, and accountable decision companion** —
> still free-data-first, still static on GitHub Pages + Actions, with at most one
> small, isolated, opt-in non-static piece.

**Status:** Draft v4.0 · **Owner:** josh99smith · **Last updated:** 2026-06-25

---

## 1. Theme

From *"what's coming, what might it do, and would acting on it have worked?"*
(v3) to *"what does it mean **for my portfolio**, what should I do about it, tell
me **before** it happens — and prove how right you've actually been."* (v4).

Three ideas define v4:

- **Personal** — answers framed around *your* holdings and risk, not a generic universe.
- **Proactive** — it reaches out (alerts, calendar, scheduled dossiers) instead of waiting to be opened.
- **Accountable** — a public, accruing track record: every directional call scored, wins and losses shown.

Seven pillars:
1. **Portfolio & personalization** — holdings, position-aware event-risk, scenario P&L.
2. **Accountability / public track record** — resolve and publish every prediction; reliability over time.
3. **Proactive delivery & alerts** — calendar feed, alerts RSS/push, optional email brief.
4. **Autonomous analyst** — scheduled agentic deep-dives; multi-step BYOK research.
5. **Deeper & more-real data** — market-implied probs done right, options/intraday/consensus where free.
6. **Model rigor II** — regimes, multi-event control, calibration feedback into stated weights.
7. **Platform & trust** — methodology/provenance, command palette, asset pages, embeds, a11y.

v4 also absorbs the explicitly-deferred items from v3: **v3.2 personalization &
delivery**, and v3.5's **regime segmentation / multi-event control / live-ledger
feedback**.

---

## 2. Pillars in detail

### 2.1 Portfolio & personalization
- **Holdings model** — extend the watchlist into positions with optional weights
  (shares/notional or %), in localStorage, shareable via URL, never sent anywhere.
- **Position-aware event-risk** — "your portfolio's event risk this week":
  upcoming events scored by holdings × impact × correlation, ranked.
- **Scenario P&L** — for a selected event, combine each weighted outcome's
  per-asset moves with your positions into an expected and worst-case portfolio
  move (a portfolio-level extension of the Strategy Lab's `expectedMovePct`).
- **Personalized brief/digest** — the v3.1 brief and the digest, filtered and
  re-ranked to the assets you actually hold.

### 2.2 Accountability / public track record
- **Make the calibration loop real** — the ledger has been stuck at 0 resolved;
  fix resolution (price-fetch + timing), and only ever score *real* realized
  moves. Never fabricate a hit.
- **Public scorecard** — an accruing "how right have we been?" page: Brier score
  and reliability bands over time, broken out by event category and asset, with
  sample sizes and confidence intervals (reuse v3.5 Wilson CIs).
- **Grade the Strategy Lab's forward EV** — log each forward expected-move call
  and score it once the event resolves; show realized-vs-expected.
- **Methodology & provenance page** — exactly how every number is produced and
  what's measured vs illustrative. Trust is the product.

### 2.3 Proactive delivery & alerts
- **Calendar (.ics)** — a static feed of upcoming events; subscribe in any calendar app.
- **Alerts feed** — high-confidence imminent events as a static RSS/JSON feed.
- **Browser push (PWA)** — opt-in push for imminent high-impact events.
- **Scheduled email brief** — optional, via a free email API in Actions on a cron.
- *(Delivery touches the one architectural decision — see §4.)*

### 2.4 Autonomous analyst (agentic)
- **Scheduled dossiers** — a Claude-in-Actions agent picks the week's top
  events/anomalies and writes deeper, **sourced** per-event analyses (optionally
  using the server-side web-search tool), published static. Extends v3.1.
- **On-demand deep-dive** — extend v3.6 Ask from single-turn answers into a
  short multi-step BYOK investigation ("research NVDA earnings risk") that pulls
  the relevant events/correlations/track-record and reasons over them.
- **Honest AI provenance** — every agent output labeled, dated, and sourced.

### 2.5 Deeper & more-real data
- **Market-implied probabilities, done right** — fed-funds futures (proper
  source) for FOMC odds, beyond today's Treasury-spread proxy.
- **Options-implied magnitude** — earnings straddle-implied moves where a free
  source exists.
- **Consensus vs actual** — real analyst consensus where obtainable, to score
  hot/inline/cool (today we honestly show actual-vs-prior only).
- **Intraday reactions** — finer post-event resolution where free data allows.
- **More breadth** — additional assets/classes; full curve and FX/commodity depth.
- *Honest ceiling:* clean consensus, options, and intraday feeds are mostly paid;
  v4 takes what's free and clearly labels what it can't measure.

### 2.6 Model rigor II (absorbs v3.5 leftovers)
- **Regime segmentation** — condition correlations on rate/vol regime (e.g.
  high- vs low-VIX, hiking vs cutting) and show regime-specific reactions.
- **Multi-event control** — de-overlap reactions when several events share a day.
- **Calibration feedback into weights** — once enough predictions resolve, shrink
  stated outcome probabilities toward base rates where the model is overconfident.
- **CI-aware EV** — propagate confidence intervals through the Lab's EV/scenario P&L.
- **Multi-leg strategies** — backtest combinations, not just single act-around rules.

### 2.7 Platform & trust
- **Command palette** — jump to any asset/event/view.
- **Asset-centric pages** — everything about one asset (events, correlations,
  track record, chart) on one deep-linkable page.
- **Embeddable widgets** — a single-event or single-asset embed.
- **Methodology/provenance, a11y, mobile depth** — finish the v3.0/v3.7 leftovers.

---

## 3. Proposed v4 roadmap

- **v4.0 — Portfolio & personalization base:** holdings + weights (localStorage,
  shareable URL); position-aware event-risk panel; per-event scenario P&L;
  personalized brief/digest. Fully static. The most visible step and it unblocks
  alerts. *(Absorbs v3.2 personalization.)*
- **v4.1 — Accountability / public track record:** fix ledger resolution; publish
  the accruing scorecard (Brier + reliability over time, by category/asset, with
  CIs); grade Strategy-Lab forward EV; methodology/provenance page. Static
  (Actions-computed).
- **v4.2 — Proactive delivery & alerts:** static .ics + alerts RSS/JSON; opt-in
  PWA push; optional Actions email brief. *(One delivery decision — §4.)*
- **v4.3 — Autonomous analyst:** scheduled Claude-in-Actions dossiers (sourced,
  optional web search); multi-step BYOK deep-dive in the app.
- **v4.4 — Deeper & more-real data:** fed-funds-futures FOMC odds; options-implied
  magnitude and real consensus where free; intraday reactions; more breadth.
- **v4.5 — Model rigor II:** regime segmentation; multi-event de-overlap;
  calibration→weights feedback; CI-aware EV; multi-leg strategies.
- **v4.6 — Platform & trust:** command palette; asset-centric pages; embeddable
  widgets; methodology/a11y/mobile polish.

---

## 4. Architectural decisions

v4 stays **static-first**. Three decisions decide how far we go before any
non-static piece is needed.

1. **Delivery (alerts / email / push).** Static covers a lot: an **.ics feed** and
   an **alerts RSS/JSON** are just files in the bundle, and **PWA browser push**
   can fire from a service worker on a published alerts feed without a server.
   The non-static needs are (a) an **email subscriber list** and (b) **server-sent
   web-push** (storing subscriptions). Options: **A.** static .ics + RSS + PWA
   push-from-feed only (no list, fully static); **B.** add an Actions cron email
   brief with an opt-in list captured via a form→GitHub-issue; **C.** a tiny
   serverless function to hold subscriptions and send push/email.
   *Recommendation:* ship **A** first; revisit B/C only if a true subscriber
   experience is wanted.

2. **Agent compute.** Scheduled dossiers run in **Actions** with the existing
   `ANTHROPIC_API_KEY` secret (already used for v3.1 briefs) — precomputed, cached,
   static. Interactive deep-dives use the user's **own key** (v3.6 BYOK).
   *Recommendation:* Actions for precomputed/published, BYOK for interactive — no
   new infra.

3. **Track-record integrity.** The scorecard must only ever show **real** resolved
   outcomes scored from prices. Historical event-study stats may seed *context*
   but must be labeled measured-from-history, never presented as live forward
   calls. *Recommendation:* separate "forward, then graded" calls from
   "historical study" everywhere in the UI.

---

## 5. Principles (carried from v1–v3, plus three)
- **Not financial advice**; calibrated scenarios + evidence only.
- **Honest probabilities** — every number cites a source; reliability is measured.
- **Free-data-first**; degrade gracefully; never fabricate stats as measured.
- **Static-host by default**; any non-static piece is an explicit, isolated opt-in.
- **(v4) Accountable by default** — publish the track record, wins *and* losses.
- **(v4) Personal stays local** — holdings live in the browser; nothing is sent to a server.
- **(v4) AI is labeled and sourced** — every agent/Claude output is dated, attributed, and grounded in the bundle.

## 6. Open questions
1. **Start where?** v4.0 portfolio (most visible, unblocks alerts), or v4.1 track
   record (the biggest trust differentiator)? *(Proposed: v4.0.)*
2. **Portfolio model** — simple watchlist + per-asset sizes, or full weighted
   positions with notional P&L?
3. **Delivery channel (§4.1)** — static-only (A), Actions email (B), or a
   serverless subscription store (C)?
4. **Agent autonomy & cost** — how aggressive should scheduled dossiers be, and
   what Actions token budget per run is acceptable?
5. **Any serverless at all?** Keep the 100%-static guarantee, or allow one tiny
   opt-in function to unlock push/email/keyless Q&A?
