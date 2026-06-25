// Small statistics helpers for the model-rigor tier (v3.5). Pure functions —
// no I/O — so they're trivially unit-tested and shared by the event study and
// the calibration loop.

export interface Interval {
  low: number;
  high: number;
}

/**
 * Wilson score interval for a binomial proportion — a well-behaved confidence
 * interval that (unlike the naive normal approximation) stays within [0, 1] and
 * is sensible at small n. Used to show the *range* around a measured hit rate
 * instead of implying a precise point estimate.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { low: 0, high: 1 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

/**
 * Hit rate shrunk toward the 0.5 base rate by sample size, via a symmetric
 * Beta(prior, prior) pseudo-count (posterior mean). This is the calibration-
 * driven weighting principle (PLAN-V3 §2.6): a 70% hit rate from n=6 is weak
 * evidence and gets pulled toward neutral, while the same rate from n=30 barely
 * moves. `prior` is the pseudo-count of "virtual" 50/50 observations on each side.
 */
export function shrunkRate(successes: number, n: number, prior = 2): number {
  if (n <= 0) return 0.5;
  return (successes + prior) / (n + 2 * prior);
}
