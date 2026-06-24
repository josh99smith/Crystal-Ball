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

interface StudyResult {
  n: number;
  avgAbsMovePct: number;
  directionHitRate: number; // dominant-direction share, 0.5..1
}

/** Close-to-close reaction (%) on the first trading day on/after each event date. */
function eventStudy(dates: string[], bars: PriceBar[]): StudyResult | null {
  if (bars.length < 2) return null;
  const reactions: number[] = [];

  for (const date of dates) {
    const i = bars.findIndex((b) => b.date >= date);
    if (i <= 0) continue; // need a prior close
    const prev = bars[i - 1].close;
    if (!prev) continue;
    reactions.push(((bars[i].close - prev) / prev) * 100);
  }

  const n = reactions.length;
  if (n < MIN_SAMPLE) return null;

  const ups = reactions.filter((r) => r > 0).length;
  const downs = reactions.filter((r) => r < 0).length;
  const avgAbsMovePct = reactions.reduce((s, r) => s + Math.abs(r), 0) / n;
  const directionHitRate = Math.max(ups, downs) / n;

  return { n, avgAbsMovePct, directionHitRate };
}

function strengthFrom({ n, avgAbsMovePct, directionHitRate }: StudyResult): number {
  const consistency = (directionHitRate - 0.5) * 2; // 0..1
  const magnitude = Math.min(1, avgAbsMovePct / 1.5); // 1.5% ≈ strong
  const confidence = Math.min(1, n / 8); // ramp with sample size
  return clamp01((0.6 * consistency + 0.4 * magnitude) * confidence);
}

/**
 * Computes historical links for one event kind from past release dates and the
 * price history of candidate assets. Returns links above sample/strength floors.
 */
export function historicalLinks(
  dates: string[],
  pricesByAsset: Map<string, PriceBar[]>,
): EventAssetLink[] {
  const links: EventAssetLink[] = [];
  for (const [asset, bars] of pricesByAsset) {
    const study = eventStudy(dates, bars);
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
      const avgAbsMovePct = round2(0.3 + (h % 18) / 10); // 0.3..2.0
      const strength = round2(
        strengthFrom({ n, avgAbsMovePct, directionHitRate }),
      );
      return {
        asset: l.asset,
        tier: "historical" as const,
        strength,
        stats: { n, avgAbsMovePct, directionHitRate },
      };
    })
    .filter((l) => l.strength >= MIN_STRENGTH);
}
