import type { MarketEvent, TimelineScaleId } from "../shared/schema";

/** A positioned event: original event plus its x% and stacking lane. */
export interface PositionedEvent {
  event: MarketEvent;
  pct: number; // 0..100 across the visible window
  lane: number;
}

export interface AxisTick {
  pct: number;
  label: string;
}

interface ScaleConfig {
  unit: "day" | "month" | "year";
  step: number;
  format: (d: Date) => string;
}

const wd = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
const md = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const mon = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
const monYr = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
const yr = (d: Date) => String(d.getFullYear());

const SCALE_CONFIG: Record<TimelineScaleId, ScaleConfig> = {
  daily: { unit: "day", step: 1, format: wd },
  weekly: { unit: "day", step: 7, format: md },
  monthly: { unit: "month", step: 1, format: mon },
  quarterly: { unit: "month", step: 1, format: mon },
  annual: { unit: "month", step: 3, format: monYr },
  decade: { unit: "year", step: 1, format: yr },
};

function pctOf(t: number, now: number, span: number): number {
  return ((t - now) / span) * 100;
}

/** Generates axis ticks aligned to natural boundaries for the scale. */
export function axisTicks(
  now: Date,
  horizon: Date,
  scale: TimelineScaleId,
): AxisTick[] {
  const cfg = SCALE_CONFIG[scale];
  const nowMs = now.getTime();
  const span = horizon.getTime() - nowMs;
  const ticks: AxisTick[] = [];

  // Start the cursor at the next natural boundary after `now`.
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (cfg.unit === "month") cursor.setDate(1);
  if (cfg.unit === "year") {
    cursor.setMonth(0, 1);
  }
  // Advance past `now`.
  const advance = (d: Date) => {
    if (cfg.unit === "day") d.setDate(d.getDate() + cfg.step);
    else if (cfg.unit === "month") d.setMonth(d.getMonth() + cfg.step);
    else d.setFullYear(d.getFullYear() + cfg.step);
  };
  while (cursor.getTime() <= nowMs) advance(cursor);

  for (let i = 0; i < 60 && cursor.getTime() <= horizon.getTime(); i++) {
    ticks.push({ pct: pctOf(cursor.getTime(), nowMs, span), label: cfg.format(cursor) });
    advance(cursor);
  }
  return ticks;
}

/**
 * Positions events across the window and stacks colliding ones into lanes so
 * nodes don't overlap. `minGapPct` is the horizontal spacing below which two
 * nodes are considered colliding.
 */
export function layoutEvents(
  events: MarketEvent[],
  now: Date,
  horizon: Date,
  minGapPct = 4,
): { positioned: PositionedEvent[]; laneCount: number } {
  const nowMs = now.getTime();
  const span = horizon.getTime() - nowMs;
  const laneLastPct: number[] = [];
  const positioned: PositionedEvent[] = [];

  for (const event of [...events].sort(
    (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
  )) {
    const pct = pctOf(Date.parse(event.scheduledAt), nowMs, span);
    let lane = laneLastPct.findIndex((last) => pct - last >= minGapPct);
    if (lane === -1) {
      lane = laneLastPct.length;
      laneLastPct.push(pct);
    } else {
      laneLastPct[lane] = pct;
    }
    positioned.push({ event, pct, lane });
  }

  return { positioned, laneCount: Math.max(1, laneLastPct.length) };
}
