import { describe, it, expect } from "vitest";
import { LunarProvider, lunarPastDates } from "../pipeline/providers/lunar";

describe("lunar phases", () => {
  it("produces roughly one new + one full moon per ~29.5 days", async () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-12-31T23:59:59Z");
    const events = await new LunarProvider().fetchEvents({ from, to });
    const newMoons = events.filter((e) => e.id.startsWith("lunar-new-"));
    const fullMoons = events.filter((e) => e.id.startsWith("lunar-full-"));
    // ~12–13 of each per year
    expect(newMoons.length).toBeGreaterThanOrEqual(11);
    expect(newMoons.length).toBeLessThanOrEqual(14);
    expect(fullMoons.length).toBeGreaterThanOrEqual(11);
    expect(fullMoons.length).toBeLessThanOrEqual(14);
    expect(events.every((e) => e.category === "lunar")).toBe(true);
  });

  it("includes a known 2026 full moon (early January)", () => {
    const dates = lunarPastDates(
      "lunar-full",
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-31T00:00:00Z"),
    );
    expect(dates.length).toBe(1);
    // 2026-01-03 is a full moon; allow ±1 day for the approximation
    expect(dates[0] >= "2026-01-02" && dates[0] <= "2026-01-04").toBe(true);
  });
});
