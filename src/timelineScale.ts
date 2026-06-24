// Pure time-axis helpers for the interactive timeline (v2.1). No d3 dependency —
// the domain is a [start, end] millisecond window the component zooms/pans.

const DAY = 24 * 60 * 60 * 1000;

export interface Tick {
  time: number;
  label: string;
}

export interface CyclicalMarker {
  time: number;
  label: string;
  kind: "halving" | "election";
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}
function startOfMonth(t: number): number {
  const d = new Date(t);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}
function startOfYear(t: number): number {
  const d = new Date(t);
  d.setUTCMonth(0, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}
function addMonths(t: number, n: number): number {
  const d = new Date(t);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.getTime();
}
function addYears(t: number, n: number): number {
  const d = new Date(t);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.getTime();
}

const md = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const monLabel = (t: number, withYear: boolean) =>
  new Date(t).toLocaleDateString(
    undefined,
    withYear ? { month: "short", year: "2-digit" } : { month: "short" },
  );

/** Boundary-aligned ticks chosen so a window shows roughly 6–10 of them. */
export function makeTicks(start: number, end: number): Tick[] {
  const span = (end - start) / DAY;
  const ticks: Tick[] = [];
  const push = (t: number, label: string) => {
    if (t >= start && t <= end) ticks.push({ time: t, label });
  };

  if (span <= 10) {
    let d = startOfDay(start);
    if (d < start) d += DAY;
    for (; d <= end; d += DAY) push(d, md(d));
  } else if (span <= 70) {
    let d = startOfDay(start);
    if (d < start) d += DAY;
    for (; d <= end; d += 7 * DAY) push(d, md(d));
  } else if (span <= 1200) {
    const step = span <= 200 ? 1 : span <= 550 ? 2 : 3;
    let m = startOfMonth(start);
    while (m < start) m = addMonths(m, 1);
    for (; m <= end; m = addMonths(m, step)) push(m, monLabel(m, span > 365));
  } else {
    const step = span <= 4000 ? 1 : 2;
    let y = startOfYear(start);
    while (y < start) y = addYears(y, 1);
    for (; y <= end; y = addYears(y, step)) push(y, String(new Date(y).getUTCFullYear()));
  }
  return ticks;
}

// Curated cyclical reference points (PLAN §2.4 — decade view). Approximate
// future dates; refine as they're confirmed.
const HALVINGS = ["2024-04-20", "2028-04-20", "2032-04-20"];
const ELECTIONS = ["2024-11-05", "2028-11-07", "2032-11-02"];

/** Cyclical markers within the visible window (mainly seen at long spans). */
export function cyclicalMarkers(start: number, end: number): CyclicalMarker[] {
  const out: CyclicalMarker[] = [];
  for (const d of HALVINGS) {
    const t = new Date(`${d}T00:00:00Z`).getTime();
    if (t >= start && t <= end) out.push({ time: t, label: "BTC halving", kind: "halving" });
  }
  for (const d of ELECTIONS) {
    const t = new Date(`${d}T00:00:00Z`).getTime();
    if (t >= start && t <= end) out.push({ time: t, label: "US election", kind: "election" });
  }
  return out;
}

/** Keep a [start, end] domain within sane bounds. */
export function clampDomain(start: number, end: number, now: number): [number, number] {
  const minSpan = 2 * DAY;
  const maxSpan = 40 * 365 * DAY;
  const minStart = now - 30 * DAY;
  const maxEnd = now + 30 * 365 * DAY;

  let span = Math.min(maxSpan, Math.max(minSpan, end - start));
  let s = start;
  let e = s + span;
  if (s < minStart) {
    s = minStart;
    e = s + span;
  }
  if (e > maxEnd) {
    e = maxEnd;
    s = e - span;
  }
  if (s < minStart) s = minStart;
  span = e - s;
  return [s, e];
}
