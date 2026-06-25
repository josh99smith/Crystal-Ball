import { describe, it, expect } from "vitest";
import { buildContext, buildSystemPrompt } from "../src/ask/anthropic";
import type { DataBundle } from "../shared/schema";

function bundle(): DataBundle {
  const soon = new Date(Date.now() + 3 * 86400_000).toISOString();
  const old = new Date(Date.now() - 30 * 86400_000).toISOString();
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    assets: [
      { id: "SPX", label: "S&P 500", class: "equity-index" },
      { id: "GOLD", label: "Gold", class: "metal" },
    ],
    events: [
      {
        id: "fred-us-cpi-x",
        title: "US CPI",
        category: "economic-data",
        scheduledAt: soon,
        isScheduled: true,
        expectedImpact: 0.85,
        source: "fred",
        links: [
          { asset: "SPX", tier: "structural", strength: 0.8 },
          { asset: "GOLD", tier: "structural", strength: 0.6 },
        ],
        outcomes: [
          { id: "hot", label: "Hot", weight: 0.3, weightSource: "historical", assetImpacts: [] },
          { id: "inline", label: "In line", weight: 0.5, weightSource: "historical", assetImpacts: [] },
        ],
        econPrints: [{ period: "2026-05-01", value: 3.2, unit: "% YoY", changeFromPrior: 0.1 }],
      },
      {
        id: "past-event",
        title: "Old Event",
        category: "economic-data",
        scheduledAt: old,
        isScheduled: true,
        expectedImpact: 0.5,
        source: "fred",
        links: [],
      },
    ],
    digest: { generatedAt: new Date().toISOString(), headline: "Big week ahead", daily: [], weekly: [] },
    calibration: [
      { kind: "us-cpi", kindLabel: "US CPI", asset: "SPX", n: 30, avgAbsMovePct: 0.9, directionHitRate: 0.7, strength: 0.6 },
    ],
  };
}

describe("buildContext", () => {
  it("includes upcoming events, assets, and calibration; drops stale events", () => {
    const ctx = buildContext(bundle());
    expect(ctx).toContain("US CPI");
    expect(ctx).toContain("most-likely: In line (50%)"); // highest-weight outcome
    expect(ctx).toContain("latest actual: +3.2 % YoY");
    expect(ctx).toContain("SPX (S&P 500)");
    expect(ctx).toContain("same-direction 70%");
    expect(ctx).not.toContain("Old Event"); // 30 days in the past, filtered out
  });

  it("caps the number of events", () => {
    const b = bundle();
    const base = b.events[0];
    b.events = Array.from({ length: 40 }, (_, i) => ({
      ...base,
      id: `e${i}`,
      title: `Event ${i}`,
    }));
    const ctx = buildContext(b, 10);
    const lines = ctx.split("\n").filter((l) => l.startsWith("- ") && l.includes("Event "));
    expect(lines.length).toBe(10);
  });
});

describe("buildSystemPrompt", () => {
  it("embeds the context and the not-financial-advice guardrail", () => {
    const sp = buildSystemPrompt("CTX-MARKER");
    expect(sp).toContain("CTX-MARKER");
    expect(sp.toLowerCase()).toContain("not financial advice");
    expect(sp).toContain("Answer ONLY from the DATA");
  });
});
