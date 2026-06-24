# Crystal-Ball — Future Events Prediction Plan

> A planning document for **Crystal-Ball**, a system that predicts potential
> future events by reasoning over a user's data signals (calendar, email,
> documents, and external context) and surfacing likely upcoming events,
> deadlines, and opportunities before they happen.

**Status:** Draft v0.1 · **Owner:** josh99smith · **Last updated:** 2026-06-24

---

## 1. Vision

Crystal-Ball turns the signals a person already generates — meetings, emails,
files, recurring patterns, and public events — into **forward-looking
predictions**. Instead of only recording what *has* happened, it answers:

- *"What is likely to happen next?"*
- *"What deadline or commitment is approaching that I haven't noticed?"*
- *"Given my history, what event is probably coming and when?"*

The goal is a **calibrated, explainable** prediction engine: every prediction
ships with a confidence score, a time window, and the evidence behind it.

## 2. Goals & Non-Goals

### Goals
- Predict concrete, near-term future events (days to a few months out).
- Attach a **confidence level** and **predicted time window** to each event.
- Make every prediction **explainable** — show the signals it was derived from.
- Continuously improve calibration by scoring past predictions against reality.

### Non-Goals (for v1)
- Long-range / speculative forecasting (years out).
- Financial-market or trading predictions.
- Fully autonomous actions (booking, sending, paying) without user confirmation.

## 3. What "Future Event" Means

| Category | Examples | Primary signals |
|----------|----------|-----------------|
| **Recurring** | Weekly 1:1, monthly report due, annual renewal | Calendar + email history |
| **Deadline-driven** | Invoice due, contract expiry, subscription renewal | Documents, email, domain/billing data |
| **Relationship** | Follow-up owed, reply expected, intro likely | Email threads, response patterns |
| **Lifecycle** | Project milestone, ship date, review cycle | Issues/PRs, docs, calendar |
| **External** | Conference, holiday, public release affecting user | Web + calendar correlation |

## 4. Architecture (High Level)

```
        ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐
        │  Connectors │ → │  Normalizer  │ → │  Signal Store    │
        │ (Cal, Mail, │   │ (events into │   │ (timeline of     │
        │  Drive,     │   │  a common    │   │  normalized      │
        │  Web)       │   │  schema)     │   │  signals)        │
        └─────────────┘   └──────────────┘   └────────┬────────┘
                                                       │
                                            ┌──────────▼──────────┐
                                            │  Prediction Engine   │
                                            │  • pattern detection │
                                            │  • LLM reasoning      │
                                            │    (Claude API)       │
                                            │  • confidence scoring │
                                            └──────────┬──────────┘
                                                       │
                          ┌────────────────────────────▼───────────────┐
                          │  Predictions Store + Calibration / Scoring  │
                          └────────────────────────────┬───────────────┘
                                                       │
                                            ┌──────────▼──────────┐
                                            │  Surfaces            │
                                            │  • API / digest      │
                                            │  • notifications     │
                                            └─────────────────────┘
```

### Components
1. **Connectors** — pull read-only signals from sources (see §5).
2. **Normalizer** — map heterogeneous inputs into a single `Signal` schema
   (`{source, type, timestamp, entities, text, metadata}`).
3. **Signal Store** — an append-only, time-ordered store of normalized signals.
4. **Prediction Engine** — the core (see §6).
5. **Predictions Store** — predictions with status (`pending`, `hit`, `miss`,
   `expired`) for calibration.
6. **Surfaces** — how predictions reach the user (digest, API, notifications).

## 5. Data Sources (available integrations)

This environment already exposes connectors we can build on:

- **Google Calendar** — recurring patterns, gaps, scheduled events.
- **Gmail / Microsoft 365 mail** — commitments, deadlines, expected replies.
- **Google Drive / SharePoint** — documents with dates, renewals, milestones.
- **GoDaddy** — domain expiry / renewal events.
- **Web search / fetch** — external public events to correlate.

> **Privacy note:** all sources are personal data. v1 is read-only and never
> sends data to third parties beyond the LLM provider used for reasoning.
> See §9.

## 6. Prediction Engine

A **hybrid** approach — deterministic pattern detection feeds an LLM reasoning
layer:

1. **Pattern detection (deterministic)**
   - Detect periodicity (e.g., "meets every other Tuesday").
   - Detect open loops (email asked a question, no reply yet).
   - Detect approaching dated items (renewal in 14 days).
   - Cheap, explainable, high-precision baseline.

2. **LLM reasoning (Claude API)**
   - Feed the candidate signals + detected patterns to Claude.
   - Ask it to propose future events with: title, predicted date/window,
     confidence (0–1), and the evidence signal IDs it used.
   - Use **structured output** (tool/JSON schema) so predictions are machine-
     readable and verifiable.
   - Default to the latest capable model (e.g., `claude-opus-4-8`); use a
     faster model for cheap candidate generation if needed.

3. **Confidence scoring & calibration**
   - Combine pattern strength + LLM confidence into a final score.
   - Score past predictions against what actually happened; adjust thresholds
     so a stated "80%" really hits ~80% of the time.

### Prediction schema (draft)
```json
{
  "id": "pred_...",
  "title": "Quarterly report due",
  "category": "deadline-driven",
  "predicted_window": { "start": "2026-07-01", "end": "2026-07-07" },
  "confidence": 0.82,
  "evidence": ["sig_123", "sig_456"],
  "rationale": "Reports were submitted in the first week of each prior quarter.",
  "status": "pending"
}
```

## 7. Roadmap (phased)

### Phase 0 — Foundations (1 week)
- Repo scaffolding, tooling, CI, `Signal`/`Prediction` schemas.
- One connector end-to-end (Google Calendar) → Signal Store.

### Phase 1 — Deterministic baseline (1–2 weeks)
- Pattern detection: periodicity, open loops, dated items.
- Predictions Store + a simple "what's coming" digest output.
- Calibration harness: record outcomes, compute hit/miss.

### Phase 2 — LLM reasoning (1–2 weeks)
- Integrate Claude API with structured-output predictions.
- Blend deterministic + LLM confidence.
- Add Gmail + Drive connectors.

### Phase 3 — Surfaces & feedback (1–2 weeks)
- Daily/weekly digest; notifications for high-confidence imminent events.
- User feedback loop ("happened" / "didn't") feeding calibration.

### Phase 4 — Breadth & hardening
- More connectors (M365, GoDaddy, web correlation).
- Calibration dashboard; per-category accuracy.
- Security/privacy review before any wider use.

## 8. Tech Stack (proposed)

- **Language/runtime:** TypeScript + Node (matches the integration tooling).
- **LLM:** Claude API (Anthropic SDK), structured output via tool use.
- **Storage:** start with SQLite/JSON for the signal & prediction stores;
  revisit when volume grows.
- **Scheduling:** a periodic job to refresh signals and re-run predictions.

> Stack is a recommendation, not a commitment — confirm before Phase 0.

## 9. Privacy, Safety & Calibration

- **Read-only by default.** No writes/sends/payments without explicit confirm.
- **Data minimization.** Only the signals needed for a prediction reach the LLM.
- **Explainability.** Every prediction links to its evidence.
- **Honest confidence.** Calibration is a first-class feature, not an add-on;
  we measure and publish real hit rates per confidence band.
- **No silent overreach.** External/public correlation is opt-in.

## 10. Success Metrics

- **Precision@high-confidence** ≥ 0.8 for predictions ≥0.8 confidence.
- **Lead time:** median days of advance warning before an event.
- **Calibration error (ECE):** stated vs. actual probability gap, trending down.
- **Usefulness:** % of surfaced predictions the user marks helpful.

## 11. Open Questions

1. **Scope of "events":** personal-productivity focus, or broader?
2. **Which sources first?** Calendar + Gmail is the proposed starting pair.
3. **Surface preference:** digest, notifications, API, or a UI?
4. **Autonomy ceiling:** predict-only, or eventually suggest/take actions?
5. **Hosting:** local-only, or a hosted service?

---

## Next Step

Confirm the scope (Q11.1–11.2) and the proposed stack (§8), then begin
**Phase 0** by scaffolding the repo and the first Calendar connector.
