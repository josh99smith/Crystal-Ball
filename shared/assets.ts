import type { Asset } from "./schema";

// Asset universe (v2.5 — expanded breadth).
export const ASSET_UNIVERSE: Asset[] = [
  // Indices & volatility
  { id: "SPX", label: "S&P 500", class: "equity-index" },
  { id: "NDX", label: "Nasdaq 100", class: "equity-index" },
  { id: "VIX", label: "Volatility (VIX)", class: "volatility" },
  // Sector ETFs
  { id: "XLK", label: "Technology (XLK)", class: "equity-sector" },
  { id: "SMH", label: "Semiconductors (SMH)", class: "equity-sector" },
  { id: "XLE", label: "Energy (XLE)", class: "equity-sector" },
  // Single names
  { id: "NVDA", label: "NVIDIA", class: "equity-single" },
  { id: "AAPL", label: "Apple", class: "equity-single" },
  { id: "MSFT", label: "Microsoft", class: "equity-single" },
  { id: "GOOGL", label: "Alphabet", class: "equity-single" },
  { id: "AMZN", label: "Amazon", class: "equity-single" },
  { id: "META", label: "Meta", class: "equity-single" },
  { id: "TSLA", label: "Tesla", class: "equity-single" },
  // Rates, FX, commodities, crypto
  { id: "US10Y", label: "US 10Y Treasury", class: "rates" },
  { id: "US2Y", label: "US 2Y Treasury", class: "rates" },
  { id: "USD", label: "US Dollar (DXY)", class: "fx" },
  { id: "EURUSD", label: "EUR/USD", class: "fx" },
  { id: "GOLD", label: "Gold", class: "metal" },
  { id: "CRUDE", label: "Crude Oil (WTI)", class: "energy" },
  { id: "BTC", label: "Bitcoin", class: "crypto" },
];

export const ASSET_IDS = ASSET_UNIVERSE.map((a) => a.id);
