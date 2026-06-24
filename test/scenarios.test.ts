import { describe, it, expect } from "vitest";
import type { MarketEvent } from "../shared/schema";
import { heuristicOutcomes } from "../pipeline/scenarios/heuristic";
import { fomcOutcomesFromRates } from "../pipeline/scenarios/weighting";
import { structuralLinksFor, earningsLinksFor } from "../pipeline/correlation/structural";

function event(partial: Partial<MarketEvent>): MarketEvent {
  return {
    id: "x",
    title: "x",
    category: "economic-data",
    scheduledAt: "2026-07-01T12:30:00Z",
    isScheduled: true,
    expectedImpact: 0.8,
    source: "test",
    links: [],
    ...partial,
  };
}

const sums1 = (ws: number[]) => Math.abs(ws.reduce((s, w) => s + w, 0) - 1) < 1e-6;

describe("structural links", () => {
  it("returns FOMC links", () => {
    expect(structuralLinksFor("fomc").length).toBeGreaterThan(3);
  });
  it("maps NVDA earnings to its sector ETF", () => {
    const assets = earningsLinksFor("NVDA").map((l) => l.asset);
    expect(assets).toContain("NVDA");
    expect(assets).toContain("SMH");
  });
});

describe("heuristicOutcomes", () => {
  it("FOMC → hawkish/hold/dovish summing to 1", () => {
    const e = event({ id: "fomc-2026-07-29", category: "monetary-policy", links: structuralLinksFor("fomc") });
    const o = heuristicOutcomes(e);
    expect(o.map((x) => x.label)).toContain("Hold as expected");
    expect(sums1(o.map((x) => x.weight))).toBe(true);
  });
  it("ECB hawkish lifts EUR/USD", () => {
    const e = event({ id: "ecb-2026-07-23", category: "monetary-policy", links: structuralLinksFor("ecb") });
    const hawk = heuristicOutcomes(e).find((x) => x.id === "hawkish")!;
    const eur = hawk.assetImpacts.find((i) => i.asset === "EURUSD");
    expect(eur?.direction).toBe("up");
  });
  it("earnings → beat/inline/miss", () => {
    const e = event({ category: "earnings", links: earningsLinksFor("AAPL") });
    expect(heuristicOutcomes(e)).toHaveLength(3);
  });
});

describe("fomcOutcomesFromRates", () => {
  const e = event({ id: "fomc-2026-07-29", category: "monetary-policy", links: structuralLinksFor("fomc") });
  it("leans cut when 3M is below the policy rate", () => {
    const o = fomcOutcomesFromRates(e, { dff: 4.33, dgs3mo: 4.0 });
    const cut = o.find((x) => x.id === "cut")!.weight;
    const hike = o.find((x) => x.id === "hike")!.weight;
    expect(cut).toBeGreaterThan(hike);
    expect(sums1(o.map((x) => x.weight))).toBe(true);
    expect(o[0].provenance).toMatch(/Treasury-implied/);
  });
  it("leans hike when 3M is above the policy rate", () => {
    const o = fomcOutcomesFromRates(e, { dff: 4.0, dgs3mo: 4.4 });
    expect(o.find((x) => x.id === "hike")!.weight).toBeGreaterThan(
      o.find((x) => x.id === "cut")!.weight,
    );
  });
});
