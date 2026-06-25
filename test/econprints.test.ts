import { describe, it, expect } from "vitest";
import { computeRecentPrints } from "../pipeline/providers/fred";

describe("computeRecentPrints", () => {
  it("computes year-over-year % for a monthly series, newest-first", () => {
    // 14 monthly points from 2025-01; value rises 1/mo from 100. The 14th point
    // (value 113) is YoY vs the 2nd (value 101): (113/101 - 1)*100 ≈ 11.9%.
    const obs = Array.from({ length: 14 }, (_, i) => {
      const month = ((i % 12) + 1).toString().padStart(2, "0");
      const year = 2025 + Math.floor(i / 12);
      return { date: `${year}-${month}-01`, value: 100 + i };
    });
    const prints = computeRecentPrints(obs, "yoy", "% YoY", 2);
    expect(prints).toHaveLength(2);
    expect(prints[0].period).toBe("2026-02-01"); // 14th point
    expect(prints[0].value).toBeCloseTo((113 / 101 - 1) * 100, 1);
    expect(prints[0].unit).toBe("% YoY");
    expect(prints[0].changeFromPrior).not.toBeUndefined();
  });

  it("computes month-over-month level change (e.g. payrolls)", () => {
    const obs = [
      { date: "2026-01-01", value: 1000 },
      { date: "2026-02-01", value: 1150 }, // +150
      { date: "2026-03-01", value: 1250 }, // +100
    ];
    const prints = computeRecentPrints(obs, "mom-change", "K jobs", 4);
    expect(prints[0].period).toBe("2026-03-01");
    expect(prints[0].value).toBeCloseTo(100, 5);
    expect(prints[0].changeFromPrior).toBeCloseTo(100 - 150, 5); // -50 vs prior change
    expect(prints[1].value).toBeCloseTo(150, 5);
  });

  it("passes through level values and ignores non-finite observations", () => {
    const obs = [
      { date: "2026-01-01", value: 2.1 },
      { date: "2026-04-01", value: Number.NaN }, // FRED "." → filtered
      { date: "2026-07-01", value: 3.4 },
    ];
    const prints = computeRecentPrints(obs, "level", "% ann.", 4);
    expect(prints).toHaveLength(2);
    expect(prints[0].value).toBeCloseTo(3.4, 5);
    expect(prints[0].changeFromPrior).toBeCloseTo(3.4 - 2.1, 5);
  });
});
