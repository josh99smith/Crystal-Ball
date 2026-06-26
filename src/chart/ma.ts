// Simple moving average for the chart overlays. Pure & testable.

/**
 * Trailing simple moving average. Returns an array aligned to `values`; entries
 * before `period` points are available are null. period must be ≥ 1.
 */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  if (period < 1) return values.map(() => null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}
