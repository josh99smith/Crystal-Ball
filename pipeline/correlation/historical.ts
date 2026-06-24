import type { EventAssetLink, MarketEvent } from "../../shared/schema";
import type { PriceBar } from "../marketdata/stooq";

/**
 * Historical (statistical) correlation tier (PLAN §7). An event study measures
 * how each asset actually reacted around past occurrences of an event type:
 * average absolute move, direction consistency (hit rate), and sample size — and
 * derives a strength score. This is the "data says" tier shown alongside the
 * curated "structural" tier.
 */

const MIN_SAMPLE = 5;
const MIN_STRENGTH = 0.15;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const DAY = 24 * 60 * 60 * 1000;
const RECENCY_HALFLIFE_YEARS = 2; // recent occurrences count more

interface StudyResult {
  n: number;
  avgAbsMovePct: number;
  directionHitRate: number; // dominant-direction share, 0.5..1
  recencyWeightedHitRate: number;
  intradayHitRate: number;
  threeDayDriftPct: number;
  significance: "low" | "medium" | "high";
}

interface Reaction {
  oneDay: number; // close[i-1] → close[i], %
  intraday: number; // open[i] → close[i], %
  threeDay: number; // close[i-1] → close[i+3], %
  weight: number; // recency weight
}

/** Multi-window event study around the first trading day on/after each date. */
function eventStudy(dates: string[], bars: PriceBar[], now: Date): StudyResult | null {
  if (bars.length < 2) return null;
  const reactions: Reaction[] = [];

  for (const date of dates) {
    const i = bars.findIndex((b) => b.date >= date);
    if (i <= 0) continue; // need a prior close
    const prev = bars[i - 1].close;
    const bar = bars[i];
    if (!prev || !bar.open) continue;
    const ageYears = (now.getTime() - Date.parse(`${date}T00:00:00Z`)) / (365 * DAY);
    const fwd = bars[i + 3]?.close;
    reactions.push({
      oneDay: ((bar.close - prev) / prev) * 100,
      intraday: ((bar.close - bar.open) / bar.open) * 100,
      threeDay: fwd ? ((fwd - prev) / prev) * 100 : ((bar.close - prev) / prev) * 100,
      weight: Math.pow(0.5, Math.max(0, ageYears) / RECENCY_HALFLIFE_YEARS),
    });
  }

  const n = reactions.length;
  if (n < MIN_SAMPLE) return null;

  const ups = reactions.filter((r) => r.oneDay > 0).length;
  const downs = reactions.filter((r) => r.oneDay < 0).length;
  const dominantUp = ups >= downs;
  const avgAbsMovePct = mean(reactions.map((r) => Math.abs(r.oneDay)));
  const directionHitRate = Math.max(ups, downs) / n;

  // Recency-weighted: share of weight agreeing with the dominant direction.
  const totalW = reactions.reduce((s, r) => s + r.weight, 0);
  const agreeW = reactions
    .filter((r) => (dominantUp ? r.oneDay > 0 : r.oneDay < 0))
    .reduce((s, r) => s + r.weight, 0);
  const recencyWeightedHitRate = totalW ? agreeW / totalW : directionHitRate;

  const intUp = reactions.filter((r) => r.intraday > 0).length;
  const intDown = reactions.filter((r) => r.intraday < 0).length;
  const intradayHitRate = Math.max(intUp, intDown) / n;

  const threeDayDriftPct = mean(reactions.map((r) => r.threeDay));
  const significance = n >= 20 ? "high" : n >= 10 ? "medium" : "low";

  return {
    n,
    avgAbsMovePct,
    directionHitRate,
    recencyWeightedHitRate,
    intradayHitRate,
    threeDayDriftPct,
    significance,
  };
}

function strengthFrom(s: {
  n: number;
  avgAbsMovePct: number;
  recencyWeightedHitRate: number;
}): number {
  const consistency = (s.recencyWeightedHitRate - 0.5) * 2; // 0..1
  const magnitude = Math.min(1, s.avgAbsMovePct / 1.5); // 1.5% ≈ strong
  const confidence = Math.min(1, s.n / 8); // ramp with sample size
  return clamp01((0.6 * consistency + 0.4 * magnitude) * confidence);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/**
 * Computes historical links for one event kind from past release dates and the
 * price history of candidate assets. Returns links above sample/strength floors.
 */
export function historicalLinks(
  dates: string[],
  pricesByAsset: Map<string, PriceBar[]>,
  now: Date,
): EventAssetLink[] {
  const links: EventAssetLink[] = [];
  for (const [asset, bars] of pricesByAsset) {
    const study = eventStudy(dates, bars, now);
    if (!study) continue;
    const strength = strengthFrom(study);
    if (strength < MIN_STRENGTH) continue;
    links.push({
      asset,
      tier: "historical",
      strength: round2(strength),
      stats: {
        n: study.n,
        avgAbsMovePct: round2(study.avgAbsMovePct),
        directionHitRate: round2(study.directionHitRate),
        recencyWeightedHitRate: round2(study.recencyWeightedHitRate),
        intradayHitRate: round2(study.intradayHitRate),
        threeDayDriftPct: round2(study.threeDayDriftPct),
        significance: study.significance,
      },
    });
  }
  return links;
}

// --- Sample fallback (fixtures / no data access) -------------------------------

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Deterministic, plausible historical links derived from an event's structural
 * links — used only for fixture/demo data so the historical tier is visible
 * without live market access. Stats are illustrative, not measured.
 */
export function sampleHistoricalLinks(event: MarketEvent): EventAssetLink[] {
  return event.links
    .filter((l) => l.tier === "structural")
    .map((l) => {
      const h = hashStr(`${event.title}:${l.asset}`);
      const n = 12 + (h % 24); // 12..35
      const directionHitRate = round2(0.55 + (h % 30) / 100); // 0.55..0.84
      const recencyWeightedHitRate = round2(
        Math.min(0.95, directionHitRate + ((h % 7) - 3) / 100),
      );
      const avgAbsMovePct = round2(0.3 + (h % 18) / 10); // 0.3..2.0
      const intradayHitRate = round2(Math.min(0.95, directionHitRate - (h % 5) / 100));
      const threeDayDriftPct = round2((((h % 21) - 10) / 10)); // -1.0..1.0
      const significance = n >= 20 ? "high" : n >= 10 ? "medium" : "low";
      const strength = round2(
        strengthFrom({ n, avgAbsMovePct, recencyWeightedHitRate }),
      );
      return {
        asset: l.asset,
        tier: "historical" as const,
        strength,
        stats: {
          n,
          avgAbsMovePct,
          directionHitRate,
          recencyWeightedHitRate,
          intradayHitRate,
          threeDayDriftPct,
          significance: significance as "low" | "medium" | "high",
        },
      };
    })
    .filter((l) => l.strength >= MIN_STRENGTH);
}
