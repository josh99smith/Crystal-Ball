import { describe, it, expect } from "vitest";
import { makeTicks, cyclicalMarkers, clampDomain } from "../src/timelineScale";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-06-24T00:00:00Z");

describe("makeTicks", () => {
  it("produces day-granularity ticks for a short window", () => {
    const t = makeTicks(now, now + 5 * DAY);
    expect(t.length).toBeGreaterThan(0);
    expect(t.length).toBeLessThanOrEqual(7);
    t.forEach((tick) => {
      expect(tick.time).toBeGreaterThanOrEqual(now);
      expect(tick.time).toBeLessThanOrEqual(now + 5 * DAY);
    });
  });

  it("produces year-granularity ticks for a decade window", () => {
    const t = makeTicks(now, now + 3650 * DAY);
    expect(t.length).toBeGreaterThan(3);
    // labels should be 4-digit years
    expect(t.every((x) => /^\d{4}$/.test(x.label))).toBe(true);
  });
});

describe("clampDomain", () => {
  it("enforces a minimum span", () => {
    const [s, e] = clampDomain(now, now + 1000, now);
    expect(e - s).toBeGreaterThanOrEqual(2 * DAY - 1);
  });
  it("keeps start from going far into the past", () => {
    const [s] = clampDomain(now - 5000 * DAY, now, now);
    expect(s).toBeGreaterThanOrEqual(now - 31 * DAY);
  });
});

describe("cyclicalMarkers", () => {
  it("surfaces halving + election markers within a wide window", () => {
    const m = cyclicalMarkers(now, now + 3650 * DAY);
    expect(m.some((x) => x.kind === "halving")).toBe(true);
    expect(m.some((x) => x.kind === "election")).toBe(true);
  });
  it("returns none for a tiny window", () => {
    expect(cyclicalMarkers(now, now + DAY)).toHaveLength(0);
  });
});
