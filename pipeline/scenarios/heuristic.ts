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
 * reasoning layer is unavailable. Outcomes use historical base-rate weights and
 * per-asset directions from a curated template; magnitudes derive from the
 * event's correlation strengths. Labeled weightSource "historical" so the UI
 * never overstates confidence.
 */

interface OutcomeTemplate {
  id: string;
  label: string;
  weight: number;
  rationale: string;
  /** Non-neutral asset directions for this outcome (others are muted). */
  dir: Record<string, Direction>;
}

// Common risk-off / risk-on direction sets reused across templates.
const RISK_OFF: Record<string, Direction> = {
  SPX: "down", NDX: "down", RUT: "down", XLK: "down", SMH: "down", XLF: "down",
  XLV: "down", DAX: "down", NIKKEI: "down", COPPER: "down", VIX: "up", BTC: "down",
};
const RISK_ON: Record<string, Direction> = {
  SPX: "up", NDX: "up", RUT: "up", XLK: "up", SMH: "up", XLF: "up",
  XLV: "up", DAX: "up", NIKKEI: "up", COPPER: "up", VIX: "down", BTC: "up",
};

const TEMPLATES: Record<string, OutcomeTemplate[]> = {
  // FOMC: hawkish/hike = risk-off + USD up; dovish/cut = risk-on + USD down.
  fomc: [
    {
      id: "hawkish",
      label: "Hawkish / hike",
      weight: 0.25,
      rationale: "Hawkish surprise: yields & USD up, risk assets and gold fall.",
      dir: { ...RISK_OFF, US2Y: "up", US5Y: "up", US10Y: "up", US30Y: "up", USD: "up", EURUSD: "down", GBPUSD: "down", USDJPY: "up", GOLD: "down", SILVER: "down" },
    },
    { id: "hold", label: "Hold as expected", weight: 0.5, rationale: "Hold; reaction driven by the statement and dot plot.", dir: {} },
    {
      id: "dovish",
      label: "Dovish / cut",
      weight: 0.25,
      rationale: "Dovish surprise: yields & USD fall, risk assets and gold rally.",
      dir: { ...RISK_ON, US2Y: "down", US5Y: "down", US10Y: "down", US30Y: "down", USD: "down", EURUSD: "up", GBPUSD: "up", USDJPY: "down", GOLD: "up", SILVER: "up" },
    },
  ],
  // ECB: hawkish = euro up, USD down; mildly risk-off.
  ecb: [
    {
      id: "hawkish",
      label: "Hawkish",
      weight: 0.25,
      rationale: "Hawkish ECB: euro strengthens, USD eases, risk mildly off.",
      dir: { EURUSD: "up", GBPUSD: "up", USD: "down", GOLD: "down", DAX: "down", SPX: "down", XLK: "down", VIX: "up" },
    },
    { id: "hold", label: "Hold", weight: 0.5, rationale: "Hold; statement/projections drive the reaction.", dir: {} },
    {
      id: "dovish",
      label: "Dovish",
      weight: 0.25,
      rationale: "Dovish ECB: euro weakens, USD firms, risk mildly on.",
      dir: { EURUSD: "down", GBPUSD: "down", USD: "up", GOLD: "up", DAX: "up", SPX: "up", XLK: "up", VIX: "down" },
    },
  ],
  // BoJ: hawkish = stronger yen / carry unwind → global risk-off.
  boj: [
    {
      id: "hawkish",
      label: "Hawkish",
      weight: 0.25,
      rationale: "Hawkish BoJ: yen firms, carry unwinds, global risk-off.",
      dir: { USDJPY: "down", NIKKEI: "down", USD: "down", SPX: "down", NDX: "down", XLK: "down", SMH: "down", GOLD: "up", VIX: "up" },
    },
    { id: "hold", label: "Hold", weight: 0.5, rationale: "Hold; guidance on policy normalization is the focus.", dir: {} },
    {
      id: "dovish",
      label: "Dovish",
      weight: 0.25,
      rationale: "Dovish BoJ: yen softens, carry resumes, global risk-on.",
      dir: { USDJPY: "up", NIKKEI: "up", USD: "up", SPX: "up", NDX: "up", XLK: "up", SMH: "up", GOLD: "down", VIX: "down" },
    },
  ],
  // Inflation prints (CPI, PCE): hot = hawkish/risk-off.
  inflation: [
    {
      id: "hot",
      label: "Above consensus (hot)",
      weight: 0.3,
      rationale: "Hotter inflation → higher-for-longer rates; risk sells off, USD firms.",
      dir: { ...RISK_OFF, US2Y: "up", US5Y: "up", US10Y: "up", US30Y: "up", USD: "up", EURUSD: "down", USDJPY: "up", GOLD: "down", SILVER: "down" },
    },
    { id: "inline", label: "In line", weight: 0.45, rationale: "In-line print; muted, mechanical reaction.", dir: {} },
    {
      id: "cool",
      label: "Below consensus (cool)",
      weight: 0.25,
      rationale: "Softer inflation → rate-cut hopes; risk rallies, USD eases.",
      dir: { ...RISK_ON, US2Y: "down", US5Y: "down", US10Y: "down", US30Y: "down", USD: "down", EURUSD: "up", USDJPY: "down", GOLD: "up", SILVER: "up" },
    },
  ],
  // Jobs report.
  jobs: [
    {
      id: "strong",
      label: "Strong payrolls",
      weight: 0.35,
      rationale: "Strong labor market: yields & USD up; equities firm on growth.",
      dir: { SPX: "up", NDX: "up", RUT: "up", XLK: "up", SMH: "up", XLF: "up", VIX: "down", US2Y: "up", US5Y: "up", US10Y: "up", USD: "up", USDJPY: "up", GOLD: "down" },
    },
    { id: "inline", label: "In line", weight: 0.4, rationale: "In-line jobs; limited reaction.", dir: {} },
    {
      id: "weak",
      label: "Weak payrolls",
      weight: 0.25,
      rationale: "Weak jobs: growth worry; yields & USD fall, equities slip, gold bid.",
      dir: { SPX: "down", NDX: "down", RUT: "down", XLK: "down", SMH: "down", XLF: "down", VIX: "up", US2Y: "down", US5Y: "down", US10Y: "down", USD: "down", USDJPY: "down", GOLD: "up" },
    },
  ],
  // Lunar phases (folklore: full moon ~ mild risk-off, new moon ~ mild risk-on).
  // Weighted heavily toward "no clear effect" — the honest prior.
  "lunar-full": [
    { id: "risk-off", label: "Risk-off bias", weight: 0.25, rationale: "Full-moon folklore: a mild risk-off tilt.", dir: { SPX: "down", NDX: "down", BTC: "down" } },
    { id: "none", label: "No clear effect", weight: 0.55, rationale: "Most likely: no meaningful lunar effect.", dir: {} },
    { id: "risk-on", label: "Risk-on bias", weight: 0.2, rationale: "Occasionally the opposite of the folklore.", dir: { SPX: "up", NDX: "up", BTC: "up" } },
  ],
  "lunar-new": [
    { id: "risk-on", label: "Risk-on bias", weight: 0.25, rationale: "New-moon folklore: a mild risk-on tilt.", dir: { SPX: "up", NDX: "up", BTC: "up" } },
    { id: "none", label: "No clear effect", weight: 0.55, rationale: "Most likely: no meaningful lunar effect.", dir: {} },
    { id: "risk-off", label: "Risk-off bias", weight: 0.2, rationale: "Occasionally the opposite of the folklore.", dir: { SPX: "down", NDX: "down", BTC: "down" } },
  ],
  // Growth (GDP).
  growth: [
    {
      id: "strong",
      label: "Above consensus",
      weight: 0.4,
      rationale: "Stronger growth lifts equities; yields and USD firm.",
      dir: { SPX: "up", NDX: "up", RUT: "up", XLK: "up", SMH: "up", XLE: "up", XLF: "up", COPPER: "up", VIX: "down", US2Y: "up", US5Y: "up", US10Y: "up", USD: "up" },
    },
    { id: "inline", label: "In line", weight: 0.35, rationale: "Growth as expected; muted.", dir: {} },
    {
      id: "weak",
      label: "Below consensus",
      weight: 0.25,
      rationale: "Weaker growth weighs on equities; yields and USD ease.",
      dir: { SPX: "down", NDX: "down", RUT: "down", XLK: "down", SMH: "down", XLE: "down", XLF: "down", COPPER: "down", VIX: "up", US2Y: "down", US5Y: "down", US10Y: "down", USD: "down" },
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
  if (event.category === "lunar") {
    const tpl = event.id.startsWith("lunar-full") ? TEMPLATES["lunar-full"] : TEMPLATES["lunar-new"];
    return fromTemplates(event, tpl).map((o) => ({
      ...o,
      provenance: "Lunar-cycle folklore — low evidence; see historical significance",
    }));
  }
  if (event.category === "monetary-policy") {
    if (event.id.startsWith("ecb-")) return fromTemplates(event, TEMPLATES.ecb);
    if (event.id.startsWith("boj-")) return fromTemplates(event, TEMPLATES.boj);
    return fromTemplates(event, TEMPLATES.fomc);
  }
  const kind = fredKindFromId(event.id);
  const templateKey = kind ? KIND_TO_TEMPLATE[kind] : undefined;
  if (templateKey) return fromTemplates(event, TEMPLATES[templateKey]);
  return genericOutcomes();
}
