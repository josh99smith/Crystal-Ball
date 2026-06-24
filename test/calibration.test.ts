import { describe, it, expect } from "vitest";
import type { MarketEvent } from "../shared/schema";
import type { PriceBar } from "../pipeline/marketdata/stooq";
import {
  buildPredictions,
  mergeLedger,
  resolveDue,
  computeMetrics,
  type LedgerRecord,
} from "../pipeline/calibration";

const now = new Date("2026-06-24T00:00:00Z");

function eventWith(scheduledAt: string): MarketEvent {
  return {
    id: `evt-${scheduledAt}`,
    title: "CPI",
    category: "economic-data",
    scheduledAt,
    isScheduled: true,
    expectedImpact: 0.8,
    source: "test",
    links: [{ asset: "SPX", tier: "structural", strength: 0.8 }],
    outcomes: [
      { id: "up", label: "up", weight: 0.6, weightSource: "historical", assetImpacts: [{ asset: "SPX", direction: "up", magnitude: "med" }] },
      { id: "down", label: "down", weight: 0.2, weightSource: "historical", assetImpacts: [{ asset: "SPX", direction: "down", magnitude: "med" }] },
      { id: "flat", label: "flat", weight: 0.2, weightSource: "historical", assetImpacts: [] },
    ],
  };
}

describe("buildPredictions", () => {
  it("derives a directional P(up) per linked asset", () => {
    const recs = buildPredictions([eventWith("2026-07-01T12:30:00Z")], now);
    expect(recs).toHaveLength(1);
    expect(recs[0].asset).toBe("SPX");
    expect(recs[0].predDir).toBe("up");
    expect(recs[0].pUp).toBeCloseTo(0.75, 2); // 0.6 / (0.6+0.2)
  });
});

describe("mergeLedger", () => {
  it("does not overwrite existing records", () => {
    const a: LedgerRecord = { id: "k", eventId: "e", title: "t", category: "economic-data", asset: "SPX", scheduledAt: "x", loggedAt: "1", pUp: 0.9, predDir: "up", confidence: 0.9 };
    const b: LedgerRecord = { ...a, loggedAt: "2", pUp: 0.1 };
    const merged = mergeLedger([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].pUp).toBe(0.9); // original kept
  });
});

describe("resolveDue + computeMetrics", () => {
  it("scores a due prediction and produces metrics", () => {
    const recs = buildPredictions([eventWith("2026-06-01T12:30:00Z")], now); // past
    const bars: PriceBar[] = [
      { date: "2026-05-29", open: 100, high: 100, low: 100, close: 100 },
      { date: "2026-06-01", open: 101, high: 103, low: 101, close: 102 }, // +2% up
    ];
    const resolved = resolveDue(recs, now, new Map([["SPX", bars]]));
    expect(resolved[0].resolved?.realizedDir).toBe("up");
    expect(resolved[0].resolved?.hit).toBe(true);

    const m = computeMetrics(resolved, now);
    expect(m.resolved).toBe(1);
    expect(m.brier).not.toBeNull();
    expect(m.bands.length).toBeGreaterThan(0);
  });

  it("leaves future predictions pending", () => {
    const recs = buildPredictions([eventWith("2026-12-01T12:30:00Z")], now);
    const resolved = resolveDue(recs, now, new Map());
    expect(resolved[0].resolved).toBeUndefined();
    expect(computeMetrics(resolved, now).pending).toBe(1);
  });
});
