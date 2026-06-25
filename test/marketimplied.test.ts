import { describe, it, expect } from "vitest";
import { impliedMoveFromChain } from "../pipeline/marketdata/options";
import { fomcOutcomesFromRates } from "../pipeline/scenarios/weighting";
import type { MarketEvent } from "../shared/schema";

describe("impliedMoveFromChain", () => {
  const calls = [
    { strike: 90, bid: 11, ask: 11.2 },
    { strike: 100, bid: 4.0, ask: 4.2 }, // ATM for spot 101
    { strike: 110, bid: 1.0, ask: 1.2 },
  ];
  const puts = [
    { strike: 90, bid: 0.8, ask: 1.0 },
    { strike: 100, bid: 3.8, ask: 4.0 }, // ATM
    { strike: 110, bid: 9.0, ask: 9.4 },
  ];

  it("computes ATM straddle implied move % from spot", () => {
    // callMid 4.1 + putMid 3.9 = 8.0; / 101 spot ≈ 7.9%
    const m = impliedMoveFromChain(101, calls, puts);
    expect(m).toBeCloseTo(7.9, 1);
  });

  it("falls back to lastPrice when no two-sided quote", () => {
    const m = impliedMoveFromChain(
      100,
      [{ strike: 100, lastPrice: 5 }],
      [{ strike: 100, lastPrice: 5 }],
    );
    expect(m).toBe(10); // (5+5)/100*100
  });

  it("returns null on thin or nonsensical input", () => {
    expect(impliedMoveFromChain(0, calls, puts)).toBeNull();
    expect(impliedMoveFromChain(100, [], puts)).toBeNull();
    expect(impliedMoveFromChain(100, [{ strike: 100 }], [{ strike: 100 }])).toBeNull();
  });
});

describe("fomcOutcomesFromRates — fed funds futures vs Treasury proxy", () => {
  const event = {
    id: "fomc-2026-07-29",
    title: "FOMC rate decision",
    category: "monetary-policy",
    scheduledAt: "2026-07-29T18:00:00Z",
    isScheduled: true,
    expectedImpact: 0.95,
    source: "fomc",
    links: [{ asset: "SPX", tier: "structural", strength: 0.8 }],
  } as unknown as MarketEvent;

  it("prefers fed funds futures and leans to cuts when implied < effective", () => {
    const out = fomcOutcomesFromRates(event, { dff: 4.0, dgs3mo: 4.0, ffrImplied: 3.6 });
    const cut = out.find((o) => o.id === "cut")!;
    const hike = out.find((o) => o.id === "hike")!;
    expect(cut.weight).toBeGreaterThan(hike.weight);
    expect(cut.provenance).toContain("Fed funds futures");
  });

  it("falls back to the T-bill proxy when futures are absent", () => {
    const out = fomcOutcomesFromRates(event, { dff: 4.0, dgs3mo: 4.3 });
    const hike = out.find((o) => o.id === "hike")!;
    const cut = out.find((o) => o.id === "cut")!;
    expect(hike.weight).toBeGreaterThan(cut.weight); // 3M well above policy → hikes
    expect(hike.provenance).toContain("T-bill proxy");
  });

  it("normalizes weights to ~1", () => {
    const out = fomcOutcomesFromRates(event, { dff: 4.0, dgs3mo: 4.0, ffrImplied: 4.0 });
    const sum = out.reduce((s, o) => s + o.weight, 0);
    expect(sum).toBeCloseTo(1, 1);
  });
});
