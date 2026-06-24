import { describe, it, expect } from "vitest";
import type { PriceBar } from "../pipeline/marketdata/stooq";
import { historicalLinks, sampleHistoricalLinks } from "../pipeline/correlation/historical";
import type { MarketEvent } from "../shared/schema";

const now = new Date("2026-06-24T00:00:00Z");

/** Build a continuous daily series; closes rise by 1% each day. */
function risingBars(startDays: number, n: number): PriceBar[] {
  const base = Date.parse("2024-01-01T00:00:00Z");
  const bars: PriceBar[] = [];
  let close = 100;
  for (let i = 0; i < n; i++) {
    const d = new Date(base + (startDays + i) * 86400000).toISOString().slice(0, 10);
    const prev = close;
    close = prev * 1.01;
    bars.push({ date: d, open: prev, high: close, low: prev, close });
  }
  return bars;
}

describe("historicalLinks (event study)", () => {
  it("finds a strong, consistent up-reaction link", () => {
    const bars = risingBars(0, 60);
    // event dates = some bar dates (need a prior bar), spaced out
    const dates = [5, 15, 25, 35, 45, 55].map((i) => bars[i].date);
    const links = historicalLinks(dates, new Map([["SPX", bars]]), now);
    const spx = links.find((l) => l.asset === "SPX");
    expect(spx).toBeTruthy();
    expect(spx!.stats!.directionHitRate).toBe(1); // always up
    expect(spx!.stats!.n).toBe(6);
    expect(spx!.strength).toBeGreaterThan(0.15);
    expect(["low", "medium", "high"]).toContain(spx!.stats!.significance);
  });

  it("returns nothing below the minimum sample", () => {
    const bars = risingBars(0, 60);
    const dates = [5, 15].map((i) => bars[i].date); // only 2
    expect(historicalLinks(dates, new Map([["SPX", bars]]), now)).toHaveLength(0);
  });
});

describe("sampleHistoricalLinks", () => {
  it("is deterministic and produces historical-tier links with stats", () => {
    const event: MarketEvent = {
      id: "fred-us-cpi-2026-07-10",
      title: "US CPI",
      category: "economic-data",
      scheduledAt: "2026-07-10T12:30:00Z",
      isScheduled: true,
      expectedImpact: 0.85,
      source: "fixture",
      links: [{ asset: "SPX", tier: "structural", strength: 0.8 }],
    };
    const a = sampleHistoricalLinks(event);
    const b = sampleHistoricalLinks(event);
    expect(a).toEqual(b); // deterministic
    expect(a[0].tier).toBe("historical");
    expect(a[0].stats?.significance).toBeTruthy();
  });
});
