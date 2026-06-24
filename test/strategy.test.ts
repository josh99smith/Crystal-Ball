import { describe, it, expect } from "vitest";
import { eventReturns, backtestStats, expectedMovePct } from "../src/strategy";
import type { MarketEvent } from "../shared/schema";

const DAY = 86400;
const t = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);

describe("eventReturns", () => {
  const series = [
    { t: t("2026-06-01"), c: 100 },
    { t: t("2026-06-02"), c: 102 }, // event day: +2% vs prior
    { t: t("2026-06-03"), c: 103 },
    { t: t("2026-06-04"), c: 105 }, // +3d vs 06-01 close
  ];
  it("computes a 1-day reaction", () => {
    const r = eventReturns([t("2026-06-02")], series, 1);
    expect(r).toHaveLength(1);
    expect(r[0].retPct).toBeCloseTo(2, 5);
  });
  it("computes a 3-day reaction", () => {
    const r = eventReturns([t("2026-06-02")], series, 3);
    expect(r[0].retPct).toBeCloseTo(5, 5); // 100 → 105
  });
});

describe("backtestStats", () => {
  it("long vs short flips sign and win rate", () => {
    const rets = [{ date: "a", retPct: 2 }, { date: "b", retPct: -1 }, { date: "c", retPct: 3 }];
    const long = backtestStats(rets, "long");
    expect(long.n).toBe(3);
    expect(long.winRate).toBeCloseTo(2 / 3, 5);
    expect(long.avgPct).toBeCloseTo(4 / 3, 5);
    const short = backtestStats(rets, "short");
    expect(short.winRate).toBeCloseTo(1 / 3, 5);
    expect(short.sumPct).toBeCloseTo(-4, 5);
  });
});

describe("expectedMovePct", () => {
  it("weights direction × magnitude into an EV", () => {
    const e = {
      outcomes: [
        { id: "u", label: "Up", weight: 0.6, weightSource: "historical", assetImpacts: [{ asset: "SPX", direction: "up", magnitude: "med" }] },
        { id: "d", label: "Down", weight: 0.4, weightSource: "historical", assetImpacts: [{ asset: "SPX", direction: "down", magnitude: "med" }] },
      ],
    } as unknown as MarketEvent;
    const { evPct } = expectedMovePct(e, "SPX");
    // 0.6*+1.0 + 0.4*-1.0 = +0.2%
    expect(evPct).toBeCloseTo(0.2, 5);
  });
});
