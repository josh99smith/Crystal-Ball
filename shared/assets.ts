import type { Asset } from "./schema";

// v1 asset universe (PLAN §12, decision locked). Expand later.
export const ASSET_UNIVERSE: Asset[] = [
  { id: "SPX", label: "S&P 500", class: "equity-index" },
  { id: "NDX", label: "Nasdaq 100", class: "equity-index" },
  { id: "NVDA", label: "NVIDIA", class: "equity-single" },
  { id: "AAPL", label: "Apple", class: "equity-single" },
  { id: "MSFT", label: "Microsoft", class: "equity-single" },
  { id: "US10Y", label: "US 10Y Treasury", class: "rates" },
  { id: "USD", label: "US Dollar (DXY)", class: "fx" },
  { id: "GOLD", label: "Gold", class: "metal" },
  { id: "CRUDE", label: "Crude Oil (WTI)", class: "energy" },
  { id: "BTC", label: "Bitcoin", class: "crypto" },
];

export const ASSET_IDS = ASSET_UNIVERSE.map((a) => a.id);
