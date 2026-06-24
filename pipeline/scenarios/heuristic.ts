import type {
  AssetImpact,
  Direction,
  Magnitude,
  MarketEvent,
  Outcome,
} from "../../shared/schema";
import { fredKindFromId } from "../providers/fred";

/**
 * Deterministic scenario generator — the honest fallback used when the Claude
 * reasoning layer is unavailable (no ANTHROPIC_API_KEY). Outcomes use historical
 * base-rate weights and per-asset directions from a curated template; magnitudes
 * derive from the event's correlation strengths. Clearly labeled weightSource:
 * "historical" so the UI never overstates confidence (PLAN §6).
 */

interface OutcomeTemplate {
  id: string;
  label: string;
  weight: number;
  rationale: string;
  /** Non-neutral asset directions for this outcome (others are muted). */
  dir: Record<string, Direction>;
}

// Direction templates keyed by event "kind".
const TEMPLATES: Record<string, OutcomeTemplate[]> = {
  // FOMC rate decision: hawkish (or hike) = risk-off; dovish (or cut) = risk-on.
  fomc: [
    {
      id: "hawkish",
      label: "Hawkish / hike",
      weight: 0.25,
      rationale: "Hawkish surprise: yields & USD up, risk assets and gold fall.",
      dir: { US10Y: "up", USD: "up", SPX: "down", NDX: "down", GOLD: "down", BTC: "down" },
    },
    {
      id: "hold",
      label: "Hold as expected",
      weight: 0.5,
      rationale: "Hold; reaction driven by the statement and dot plot.",
      dir: {},
    },
    {
      id: "dovish",
      label: "Dovish / cut",
      weight: 0.25,
      rationale: "Dovish surprise: yields & USD fall, risk assets and gold rally.",
      dir: { US10Y: "down", USD: "down", SPX: "up", NDX: "up", GOLD: "up", BTC: "up" },
    },
  ],
  // Inflation prints (CPI, PCE): hot = hawkish/risk-off.
  inflation: [
    {
      id: "hot",
      label: "Above consensus (hot)",
      weight: 0.3,
      rationale: "Hotter inflation → higher-for-longer rates; risk assets sell off, USD firms.",
      dir: { SPX: "down", NDX: "down", US10Y: "up", USD: "up", GOLD: "down", BTC: "down" },
    },
    {
      id: "inline",
      label: "In line",
      weight: 0.45,
      rationale: "In-line print; muted, mechanical reaction.",
      dir: {},
    },
    {
      id: "cool",
      label: "Below consensus (cool)",
      weight: 0.25,
      rationale: "Softer inflation → rate-cut hopes; risk rallies, USD eases.",
      dir: { SPX: "up", NDX: "up", US10Y: "down", USD: "down", GOLD: "up", BTC: "up" },
    },
  ],
  // Jobs report.
  jobs: [
    {
      id: "strong",
      label: "Strong payrolls",
      weight: 0.35,
      rationale: "Strong labor market: yields & USD up on a hawkish Fed; equities firm on growth.",
      dir: { US10Y: "up", USD: "up", SPX: "up", NDX: "up", GOLD: "down" },
    },
    { id: "inline", label: "In line", weight: 0.4, rationale: "In-line jobs; limited reaction.", dir: {} },
    {
      id: "weak",
      label: "Weak payrolls",
      weight: 0.25,
      rationale: "Weak jobs: growth worry; yields & USD fall, equities slip, gold bid.",
      dir: { US10Y: "down", USD: "down", SPX: "down", NDX: "down", GOLD: "up" },
    },
  ],
  // Growth (GDP).
  growth: [
    {
      id: "strong",
      label: "Above consensus",
      weight: 0.4,
      rationale: "Stronger growth lifts equities; yields and USD firm.",
      dir: { SPX: "up", NDX: "up", US10Y: "up", USD: "up" },
    },
    { id: "inline", label: "In line", weight: 0.35, rationale: "Growth as expected; muted.", dir: {} },
    {
      id: "weak",
      label: "Below consensus",
      weight: 0.25,
      rationale: "Weaker growth weighs on equities; yields and USD ease.",
      dir: { SPX: "down", NDX: "down", US10Y: "down", USD: "down" },
    },
  ],
};

const KIND_TO_TEMPLATE: Record<string, keyof typeof TEMPLATES> = {
  "us-cpi": "inflation",
  "us-pce": "inflation",
  "us-nfp": "jobs",
  "us-gdp": "growth",
};

function magnitudeFor(strength: number): Magnitude {
  if (strength >= 0.8) return "high";
  if (strength >= 0.55) return "med";
  return "low";
}

/** Builds outcomes from a template, emitting impacts only for linked assets. */
function fromTemplates(event: MarketEvent, templates: OutcomeTemplate[]): Outcome[] {
  const strengthByAsset = new Map(event.links.map((l) => [l.asset, l.strength]));
  return templates.map((t) => {
    const assetImpacts: AssetImpact[] = [];
    for (const link of event.links) {
      const direction = t.dir[link.asset];
      if (direction && direction !== "neutral") {
        assetImpacts.push({
          asset: link.asset,
          direction,
          magnitude: magnitudeFor(strengthByAsset.get(link.asset) ?? 0.5),
        });
      }
    }
    return {
      id: t.id,
      label: t.label,
      weight: t.weight,
      weightSource: "historical",
      assetImpacts,
      rationale: t.rationale,
      provenance: "Historical base rates (illustrative)",
    };
  });
}

/** Earnings: beat / in-line / miss, driven by the primary (highest-strength) link. */
function earningsOutcomes(event: MarketEvent): Outcome[] {
  const sorted = [...event.links].sort((a, b) => b.strength - a.strength);
  const primary = sorted[0]?.asset;
  const ticker = primary ? `${primary} ` : "";
  const impactSet = (lean: Direction): AssetImpact[] =>
    sorted.map((l, i) => ({
      asset: l.asset,
      direction: lean,
      magnitude: i === 0 ? "high" : ("low" as Magnitude),
    }));

  return [
    {
      id: "beat",
      label: "Beat & raise",
      weight: 0.45,
      weightSource: "historical",
      assetImpacts: impactSet("up"),
      rationale: `${ticker}tops estimates / lifts guidance — stock gaps up, modest index lift.`,
      provenance: "Historical base rates (illustrative)",
    },
    {
      id: "inline",
      label: "In line",
      weight: 0.25,
      weightSource: "historical",
      assetImpacts: [],
      rationale: "Results roughly in line; reaction driven by guidance nuance.",
      provenance: "Historical base rates (illustrative)",
    },
    {
      id: "miss",
      label: "Miss / soft guide",
      weight: 0.3,
      weightSource: "historical",
      assetImpacts: impactSet("down"),
      rationale: `${ticker}disappoints — stock sells off, small index drag.`,
      provenance: "Historical base rates (illustrative)",
    },
  ];
}

/** Generic 2-way fallback for events without a specific template. */
function genericOutcomes(): Outcome[] {
  return [
    {
      id: "as-expected",
      label: "As expected",
      weight: 0.6,
      weightSource: "historical",
      assetImpacts: [],
      rationale: "Base case: outcome near expectations, limited market impact.",
      provenance: "Historical base rates (illustrative)",
    },
    {
      id: "surprise",
      label: "Surprise",
      weight: 0.4,
      weightSource: "historical",
      assetImpacts: [],
      rationale: "Tail case: an unexpected result drives a larger move in linked assets.",
      provenance: "Historical base rates (illustrative)",
    },
  ];
}

export function heuristicOutcomes(event: MarketEvent): Outcome[] {
  if (event.category === "earnings") return earningsOutcomes(event);
  if (event.category === "monetary-policy") return fromTemplates(event, TEMPLATES.fomc);
  const kind = fredKindFromId(event.id);
  const templateKey = kind ? KIND_TO_TEMPLATE[kind] : undefined;
  if (templateKey) return fromTemplates(event, TEMPLATES[templateKey]);
  return genericOutcomes();
}
