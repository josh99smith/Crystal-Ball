import type { MarketEvent } from "../shared/schema";

// Client-side strategy math (PLAN-V3 §2.4). Operates on the published price
// series (data/prices.json) + past events (data/past-events.json).

const SEC_DAY = 86400;
const floorDay = (sec: number) => Math.floor(sec / SEC_DAY) * SEC_DAY;

export interface BacktestReturn {
  date: string;
  retPct: number;
}

/**
 * Close-based reaction for each event time: 1-day = prior close → event-day
 * close; 3-day = prior close → +3 trading days. Needs the series to cover the
 * dates (≈ the published ~1y window).
 */
export function eventReturns(
  eventTimesSec: number[],
  series: Array<{ t: number; c: number }>,
  horizon: 1 | 3,
): BacktestReturn[] {
  if (series.length < 2) return [];
  const bars = [...series].sort((a, b) => a.t - b.t);
  const days = bars.map((b) => floorDay(b.t));
  const out: BacktestReturn[] = [];
  for (const ts of eventTimesSec) {
    const d = floorDay(ts);
    const i = days.findIndex((x) => x >= d);
    if (i <= 0) continue;
    const fwd = i + (horizon - 1);
    if (fwd >= bars.length) continue;
    const prev = bars[i - 1].c;
    if (!prev) continue;
    out.push({
      date: new Date(d * 1000).toISOString().slice(0, 10),
      retPct: ((bars[fwd].c - prev) / prev) * 100,
    });
  }
  return out;
}

export interface BacktestStats {
  n: number;
  winRate: number; // share where the position made money
  avgPct: number;
  medianPct: number;
  sumPct: number;
  best: number;
  worst: number;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Aggregate returns under a long/short position. */
export function backtestStats(
  returns: BacktestReturn[],
  direction: "long" | "short",
): BacktestStats {
  const signed = returns.map((r) => (direction === "short" ? -r.retPct : r.retPct));
  const n = signed.length;
  if (n === 0) return { n: 0, winRate: 0, avgPct: 0, medianPct: 0, sumPct: 0, best: 0, worst: 0 };
  return {
    n,
    winRate: signed.filter((x) => x > 0).length / n,
    avgPct: signed.reduce((s, x) => s + x, 0) / n,
    medianPct: median(signed),
    sumPct: signed.reduce((s, x) => s + x, 0),
    best: Math.max(...signed),
    worst: Math.min(...signed),
  };
}

const MAG_PCT: Record<string, number> = { low: 0.4, med: 1.0, high: 1.8 };

export interface EvRow {
  label: string;
  weight: number;
  contributionPct: number;
}

/**
 * Expected % move for an asset from an event's weighted outcomes:
 * Σ weight × direction × magnitude. A scenario→number bridge.
 */
export function expectedMovePct(
  event: MarketEvent,
  asset: string,
): { evPct: number; rows: EvRow[] } {
  const rows: EvRow[] = [];
  let evPct = 0;
  for (const o of event.outcomes ?? []) {
    const im = o.assetImpacts.find((i) => i.asset === asset);
    let c = 0;
    if (im && im.direction !== "neutral") {
      c = o.weight * (im.direction === "up" ? 1 : -1) * (MAG_PCT[im.magnitude] ?? 0.8);
    }
    evPct += c;
    rows.push({ label: o.label, weight: o.weight, contributionPct: c });
  }
  return { evPct, rows };
}
