import { describe, it, expect } from "vitest";
import { sma } from "../src/chart/ma";

describe("sma", () => {
  it("computes a trailing simple moving average with leading nulls", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("period 1 returns the series unchanged", () => {
    expect(sma([5, 6, 7], 1)).toEqual([5, 6, 7]);
  });

  it("is stable over a longer window (rolling sum correctness)", () => {
    const v = [10, 20, 30, 40, 50, 60];
    expect(sma(v, 2)).toEqual([null, 15, 25, 35, 45, 55]);
  });

  it("guards invalid period", () => {
    expect(sma([1, 2, 3], 0)).toEqual([null, null, null]);
  });
});
