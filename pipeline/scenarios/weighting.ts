import type {
  AssetImpact,
  Direction,
  Magnitude,
  MarketEvent,
  Outcome,
} from "../../shared/schema";
import type { FredProvider } from "../providers/fred";
import { fetchYahooLastClose } from "../marketdata/yahoo";

/**
 * Market-based weighting (PLAN-V2 §2.3, upgraded v4.4) — FOMC hike/hold/cut
 * probabilities from market data, with explicit provenance.
 *
 * Preferred source: 30-Day Fed Funds futures (CME "ZQ", front month) via Yahoo —
 * the contract price implies the average effective funds rate for the month
 * (implied = 100 − price), so the implied-vs-current gap is a direct read on the
 * priced near-term path. This is the actual instrument CME FedWatch is built on
 * (front-month only here — clean per-meeting contract data is paid).
 * Fallback: the 3-month T-bill vs the effective policy rate, when futures are
 * unavailable. Both are labeled.
 */

export interface RateContext {
  dff: number; // effective federal funds rate (%)
  dgs3mo: number; // 3-month Treasury (%)
  ffrImplied?: number; // fed funds futures front-month implied rate (%), if available
}

/** Fetch the rate context (FRED rates + fed funds futures). null if unavailable. */
export async function fetchRateContext(fred: FredProvider): Promise<RateContext | null> {
  const [dff, dgs3mo, zq] = await Promise.all([
    fred.latestValue("DFF"),
    fred.latestValue("DGS3MO"),
    fetchYahooLastClose("ZQ=F"), // 30-Day Fed Funds futures, front month
  ]);
  if (dff == null || dgs3mo == null) return null;
  // ZQ price → implied average funds rate for the contract month.
  const ffrImplied = zq != null && zq > 50 && zq <= 100 ? round2(100 - zq) : undefined;
  return { dff, dgs3mo, ffrImplied };
}

const FOMC_DIR: Record<"hike" | "cut", Record<string, Direction>> = {
  hike: {
    US2Y: "up", US5Y: "up", US10Y: "up", US30Y: "up", USD: "up", EURUSD: "down",
    GBPUSD: "down", USDJPY: "up", SPX: "down", NDX: "down", RUT: "down",
    XLK: "down", XLF: "down", SMH: "down", VIX: "up", GOLD: "down", SILVER: "down",
    BTC: "down",
  },
  cut: {
    US2Y: "down", US5Y: "down", US10Y: "down", US30Y: "down", USD: "down",
    EURUSD: "up", GBPUSD: "up", USDJPY: "down", SPX: "up", NDX: "up", RUT: "up",
    XLK: "up", XLF: "up", SMH: "up", VIX: "down", GOLD: "up", SILVER: "up",
    BTC: "up",
  },
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
 * FOMC outcomes weighted by the market-implied near-term rate path.
 * gap = implied near-term rate − current policy rate, in bps: markedly negative
 * ⇒ market prices cuts, markedly positive ⇒ hikes, near zero ⇒ hold. Prefers
 * fed funds futures; falls back to the 3M T-bill spread.
 */
export function fomcOutcomesFromRates(event: MarketEvent, ctx: RateContext): Outcome[] {
  const useFutures = ctx.ffrImplied != null;
  const impliedRate = useFutures ? (ctx.ffrImplied as number) : ctx.dgs3mo;
  const gapBps = (impliedRate - ctx.dff) * 100;

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

  const provenance = useFutures
    ? `Fed funds futures (ZQ front month): implied ${impliedRate.toFixed(2)}% vs effective ` +
      `${ctx.dff.toFixed(2)}% (${gapBps >= 0 ? "+" : ""}${Math.round(gapBps)}bps → leans ${lean}). ` +
      `Front-month average; per-meeting contract data is paid.`
    : `Treasury-implied: 3M ${ctx.dgs3mo.toFixed(2)}% vs policy ${ctx.dff.toFixed(2)}% ` +
      `(${gapBps >= 0 ? "+" : ""}${Math.round(gapBps)}bps → leans ${lean}). Fed funds futures unavailable — T-bill proxy.`;

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
