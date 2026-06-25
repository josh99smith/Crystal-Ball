import { describe, it, expect } from "vitest";
import { wilsonInterval, shrunkRate } from "../pipeline/stats";

describe("wilsonInterval", () => {
  it("stays within [0,1] and brackets the point estimate", () => {
    const { low, high } = wilsonInterval(8, 10);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(1);
    expect(low).toBeLessThan(0.8);
    expect(high).toBeGreaterThan(0.8);
  });

  it("is wider for small n than large n at the same proportion", () => {
    const small = wilsonInterval(7, 10); // p=0.7
    const large = wilsonInterval(70, 100); // p=0.7
    const wSmall = small.high - small.low;
    const wLarge = large.high - large.low;
    expect(wSmall).toBeGreaterThan(wLarge);
  });

  it("handles degenerate input", () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
    const perfect = wilsonInterval(5, 5);
    expect(perfect.high).toBeLessThanOrEqual(1);
    expect(perfect.low).toBeLessThan(1);
  });
});

describe("shrunkRate", () => {
  it("pulls small samples toward 0.5 more than large samples", () => {
    const small = shrunkRate(6, 6); // raw 1.0, n=6
    const large = shrunkRate(60, 60); // raw 1.0, n=60
    expect(small).toBeLessThan(large);
    expect(small).toBeGreaterThan(0.5);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThan(1);
  });

  it("returns ~0.5 with no evidence and is symmetric", () => {
    expect(shrunkRate(0, 0)).toBeCloseTo(0.5, 5);
    // a 70% rate and a 30% rate shrink symmetrically around 0.5
    const up = shrunkRate(7, 10);
    const down = shrunkRate(3, 10);
    expect(up + down).toBeCloseTo(1, 5);
    expect(up).toBeLessThan(0.7); // shrunk inward
  });
});
