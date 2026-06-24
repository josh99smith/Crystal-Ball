import type {
  CalibrationMetrics,
  EventCategory,
  MarketEvent,
  ReliabilityBand,
} from "../shared/schema";
import type { PriceBar } from "./marketdata/stooq";

/**
 * Calibration loop (PLAN-V2 §2.4). For each scheduled event-asset, we log the
 * model's implied P(up) ahead of time; once the event passes we resolve the
 * actual move from prices and score it. Metrics (reliability bands, Brier,
 * per-category hit rate) accrue across runs via a persisted ledger.
 *
 * Directional by design: it scores "when the model implied an asset would rise
 * with X% confidence, how often did it?" — fully computable from free prices.
 */

export interface LedgerRecord {
  id: string; // `${eventId}::${asset}`
  eventId: string;
  title: string;
  category: EventCategory;
  asset: string;
  scheduledAt: string;
  loggedAt: string;
  pUp: number; // normalized P(up) given a directional move, 0..1
  predDir: "up" | "down";
  confidence: number; // max(pUp, 1-pUp)
  resolved?: {
    realizedReturnPct: number;
    realizedDir: "up" | "down";
    hit: boolean;
    resolvedAt: string;
  };
}

const DAY = 24 * 60 * 60 * 1000;
const RESOLVE_DELAY = 1.5 * DAY; // wait for the reaction day to close

/** Build (unresolved) prediction records from current events' weighted outcomes. */
export function buildPredictions(events: MarketEvent[], now: Date): LedgerRecord[] {
  const records: LedgerRecord[] = [];
  for (const event of events) {
    if (!event.isScheduled || !event.outcomes?.length) continue;
    // Aggregate directional probability per linked asset across outcomes.
    const up = new Map<string, number>();
    const down = new Map<string, number>();
    for (const o of event.outcomes) {
      for (const im of o.assetImpacts) {
        if (im.direction === "up") up.set(im.asset, (up.get(im.asset) ?? 0) + o.weight);
        else if (im.direction === "down") down.set(im.asset, (down.get(im.asset) ?? 0) + o.weight);
      }
    }
    const assets = new Set([...up.keys(), ...down.keys()]);
    for (const asset of assets) {
      const u = up.get(asset) ?? 0;
      const d = down.get(asset) ?? 0;
      const denom = u + d;
      if (denom < 0.2 || u === d) continue; // no directional view
      const pUp = u / denom;
      const predDir = pUp > 0.5 ? "up" : "down";
      records.push({
        id: `${event.id}::${asset}`,
        eventId: event.id,
        title: event.title,
        category: event.category,
        asset,
        scheduledAt: event.scheduledAt,
        loggedAt: now.toISOString(),
        pUp: Math.round(pUp * 1000) / 1000,
        predDir,
        confidence: Math.round(Math.max(pUp, 1 - pUp) * 1000) / 1000,
      });
    }
  }
  return records;
}

/** Merge new predictions into the ledger without overwriting existing records. */
export function mergeLedger(existing: LedgerRecord[], fresh: LedgerRecord[]): LedgerRecord[] {
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const r of fresh) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()];
}

/** Close-to-close reaction (%) on the first trading day on/after a date. */
function reactionPct(date: string, bars: PriceBar[]): number | null {
  if (bars.length < 2) return null;
  const i = bars.findIndex((b) => b.date >= date);
  if (i <= 0) return null;
  const prev = bars[i - 1].close;
  if (!prev) return null;
  return ((bars[i].close - prev) / prev) * 100;
}

/** Resolve due, unresolved records using fetched price history. Mutates copies. */
export function resolveDue(
  ledger: LedgerRecord[],
  now: Date,
  pricesByAsset: Map<string, PriceBar[]>,
): LedgerRecord[] {
  return ledger.map((r) => {
    if (r.resolved) return r;
    if (Date.parse(r.scheduledAt) > now.getTime() - RESOLVE_DELAY) return r;
    const bars = pricesByAsset.get(r.asset);
    if (!bars) return r;
    const ret = reactionPct(r.scheduledAt.slice(0, 10), bars);
    if (ret == null || ret === 0) return r;
    const realizedDir = ret > 0 ? "up" : "down";
    return {
      ...r,
      resolved: {
        realizedReturnPct: Math.round(ret * 100) / 100,
        realizedDir,
        hit: realizedDir === r.predDir,
        resolvedAt: now.toISOString(),
      },
    };
  });
}

/** Assets that have unresolved, now-due records (need prices to resolve). */
export function assetsNeedingResolution(ledger: LedgerRecord[], now: Date): string[] {
  const set = new Set<string>();
  for (const r of ledger) {
    if (!r.resolved && Date.parse(r.scheduledAt) <= now.getTime() - RESOLVE_DELAY) {
      set.add(r.asset);
    }
  }
  return [...set];
}

const BAND_EDGES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0001];

export function computeMetrics(ledger: LedgerRecord[], now: Date): CalibrationMetrics {
  const resolved = ledger.filter((r) => r.resolved);
  const pending = ledger.length - resolved.length;

  const bands: ReliabilityBand[] = [];
  for (let i = 0; i < BAND_EDGES.length - 1; i++) {
    const lo = BAND_EDGES[i];
    const hi = BAND_EDGES[i + 1];
    const inBand = resolved.filter((r) => r.confidence >= lo && r.confidence < hi);
    if (inBand.length === 0) continue;
    bands.push({
      lo,
      hi: Math.min(hi, 1),
      n: inBand.length,
      avgConfidence: avg(inBand.map((r) => r.confidence)),
      hitRate: avg(inBand.map((r) => (r.resolved!.hit ? 1 : 0))),
    });
  }

  const brier =
    resolved.length === 0
      ? null
      : avg(
          resolved.map((r) => {
            const actualUp = r.resolved!.realizedDir === "up" ? 1 : 0;
            return (r.pUp - actualUp) ** 2;
          }),
        );

  const cats = new Map<EventCategory, LedgerRecord[]>();
  for (const r of resolved) {
    const arr = cats.get(r.category) ?? [];
    arr.push(r);
    cats.set(r.category, arr);
  }
  const byCategory = [...cats.entries()].map(([category, rs]) => ({
    category,
    n: rs.length,
    hitRate: avg(rs.map((r) => (r.resolved!.hit ? 1 : 0))),
  }));

  return {
    resolved: resolved.length,
    pending,
    brier: brier == null ? null : Math.round(brier * 1000) / 1000,
    bands,
    byCategory,
    updatedAt: now.toISOString(),
  };
}

function avg(xs: number[]): number {
  return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 1000) / 1000 : 0;
}
