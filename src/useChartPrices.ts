import { useEffect, useState } from "react";

/** A published daily bar. OHLC + volume since chart overhaul C1; `c` always present. */
export interface ChartBar {
  t: number; // unix seconds
  c: number; // close (back-compat)
  o?: number;
  h?: number;
  l?: number;
  v?: number;
}

/** Per-asset recent price series, published by the pipeline (data/prices.json). */
export type PriceSeries = Record<string, ChartBar[]>;

export function useChartPrices(): PriceSeries | null {
  const [prices, setPrices] = useState<PriceSeries | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/prices.json`)
      .then((res) => (res.ok ? (res.json() as Promise<PriceSeries>) : {}))
      .then(setPrices)
      .catch(() => setPrices({}));
  }, []);
  return prices;
}
