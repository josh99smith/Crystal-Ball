import { useEffect, useState } from "react";

/** Per-asset recent price series, published by the pipeline (data/prices.json). */
export type PriceSeries = Record<string, Array<{ t: number; c: number }>>;

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
