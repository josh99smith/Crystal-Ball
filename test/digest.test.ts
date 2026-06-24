import { describe, it, expect } from "vitest";
import type { MarketEvent } from "../shared/schema";
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
  };
}

describe("buildDigest", () => {
  it("separates 7-day and 30-day windows and headlines high-impact", () => {
    const events = [ev("soon", 3, 0.85), ev("mid", 20, 0.6), ev("far", 50, 0.9)];
    const d = buildDigest(events, now);
    expect(d.daily.map((i) => i.eventId)).toContain("soon");
    expect(d.daily.map((i) => i.eventId)).not.toContain("mid");
    expect(d.weekly.map((i) => i.eventId)).toEqual(expect.arrayContaining(["soon", "mid"]));
    expect(d.weekly.map((i) => i.eventId)).not.toContain("far"); // 50d out
    expect(d.headline).toMatch(/next 7 days/);
  });

  it("reports a quiet week when nothing is near", () => {
    const d = buildDigest([ev("far", 40, 0.9)], now);
    expect(d.daily).toHaveLength(0);
    expect(d.headline).toMatch(/Quiet/);
  });
});
