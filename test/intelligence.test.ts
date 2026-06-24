import { describe, it, expect } from "vitest";
import type { MarketEvent } from "../shared/schema";
import { buildIntelligence } from "../pipeline/intelligence";
import { buildDigest } from "../pipeline/digest";

const now = new Date("2026-06-24T00:00:00Z");

function ev(id: string, daysAhead: number, impact: number): MarketEvent {
  return {
    id,
    title: id,
    category: "economic-data",
    scheduledAt: new Date(now.getTime() + daysAhead * 86400000).toISOString(),
    isScheduled: true,
    expectedImpact: impact,
    source: "test",
    links: [{ asset: "SPX", tier: "structural", strength: 0.8 }],
    outcomes: [
      { id: "a", label: "Above", weight: 0.6, weightSource: "historical", assetImpacts: [] },
      { id: "b", label: "Below", weight: 0.4, weightSource: "historical", assetImpacts: [] },
    ],
  };
}

describe("buildIntelligence (heuristic path, no API key)", () => {
  it("produces a brief, narratives, and clustering anomalies", async () => {
    const events = [
      ev("CPI", 3, 0.85),
      ev("NFP", 3, 0.82), // same day cluster, high-impact
      ev("OPEX", 3, 0.6),
      ev("GDP", 20, 0.7),
    ];
    const digest = buildDigest(events, now);
    const intel = await buildIntelligence(events, digest, now);

    expect(intel.generatedBy).toBe("heuristic");
    expect(intel.brief.length).toBeGreaterThan(10);
    expect(Object.keys(intel.narratives).length).toBeGreaterThan(0);
    // 3 events stack on the same day with a high-impact one → a callout
    expect(intel.anomalies.join(" ")).toMatch(/stack on|Heavy week/);
  });
});
