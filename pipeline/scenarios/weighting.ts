import type {
  AssetImpact,
  Direction,
  Magnitude,
  MarketEvent,
  Outcome,
} from "../../shared/schema";
import type { FredProvider } from "../providers/fred";

/**
 * Market-based weighting (PLAN-V2 §2.3) — FOMC hike/hold/cut probabilities
 * derived from free Treasury-rate data, with explicit provenance. This is a
 * proxy for fed-funds-futures (CME FedWatch) odds, which aren't freely available
 * via API: we use the near-term 3-month T-bill vs the effective policy rate as a
 * standard read on the expected near-term rate path. Labeled as such.
 */

export interface RateContext {
  dff: number; // effective federal funds rate (%)
  dgs3mo: number; // 3-month Treasury (%)
}

/** Fetch the rate context from FRED. null if unavailable (caller falls back). */
export async function fetchRateContext(fred: FredProvider): Promise<RateContext | null> {
  const [dff, dgs3mo] = await Promise.all([
    fred.latestValue("DFF"),
    fred.latestValue("DGS3MO"),
  ]);
  if (dff == null || dgs3mo == null) return null;
  return { dff, dgs3mo };
}

const FOMC_DIR: Record<"hike" | "cut", Record<string, Direction>> = {
  hike: { US10Y: "up", USD: "up", SPX: "down", NDX: "down", GOLD: "down", BTC: "down" },
  cut: { US10Y: "down", USD: "down", SPX: "up", NDX: "up", GOLD: "up", BTC: "up" },
};

function magnitudeFor(strength: number): Magnitude {
  if (strength >= 0.8) return "high";
  if (strength >= 0.55) return "med";
  return "low";
}

function impactsFor(event: MarketEvent, dir: Record<string, Direction>): AssetImpact[] {
  const strength = new Map(event.links.map((l) => [l.asset, l.strength]));
  const out: AssetImpact[] = [];
  for (const link of event.links) {
    const direction = dir[link.asset];
    if (direction && direction !== "neutral") {
      out.push({ asset: link.asset, direction, magnitude: magnitudeFor(strength.get(link.asset) ?? 0.5) });
    }
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * FOMC outcomes weighted by the Treasury-implied near-term rate path.
 * gap = 3M T-bill − policy rate, in bps: markedly negative ⇒ market prices cuts,
 * markedly positive ⇒ hikes, near zero ⇒ hold.
 */
export function fomcOutcomesFromRates(event: MarketEvent, ctx: RateContext): Outcome[] {
  const gapBps = (ctx.dgs3mo - ctx.dff) * 100;

  let pHike = 0.2;
  let pHold = 0.6;
  let pCut = 0.2;
  let lean = "a hold";

  if (gapBps <= -10) {
    const x = Math.min(1, -gapBps / 40); // 40bps ≈ a fully-priced cut
    pCut = 0.2 + 0.6 * x;
    pHold = 0.7 - 0.5 * x;
    pHike = Math.max(0.05, 1 - pCut - pHold);
    lean = "a cut";
  } else if (gapBps >= 10) {
    const x = Math.min(1, gapBps / 40);
    pHike = 0.2 + 0.6 * x;
    pHold = 0.7 - 0.5 * x;
    pCut = Math.max(0.05, 1 - pHike - pHold);
    lean = "a hike";
  }
  const total = pHike + pHold + pCut;
  pHike /= total;
  pHold /= total;
  pCut /= total;

  const provenance =
    `Treasury-implied: 3M ${ctx.dgs3mo.toFixed(2)}% vs policy ${ctx.dff.toFixed(2)}% ` +
    `(${gapBps >= 0 ? "+" : ""}${Math.round(gapBps)}bps → leans ${lean}). Proxy for fed-funds-futures odds.`;

  return [
    {
      id: "hike",
      label: "Hike",
      weight: round2(pHike),
      weightSource: "market-implied",
      assetImpacts: impactsFor(event, FOMC_DIR.hike),
      rationale: "Higher rates: yields & USD up, risk assets and gold fall.",
      provenance,
    },
    {
      id: "hold",
      label: "Hold",
      weight: round2(pHold),
      weightSource: "market-implied",
      assetImpacts: [],
      rationale: "No change; reaction driven by the statement and dot plot.",
      provenance,
    },
    {
      id: "cut",
      label: "Cut",
      weight: round2(pCut),
      weightSource: "market-implied",
      assetImpacts: impactsFor(event, FOMC_DIR.cut),
      rationale: "Lower rates: yields & USD fall, risk assets and gold rally.",
      provenance,
    },
  ];
}
