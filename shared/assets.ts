import type { Asset } from "./schema";

// Asset universe (v3.4 — deeper breadth: rate curve, FX majors, more
// commodities, international indices, more sectors).
export const ASSET_UNIVERSE: Asset[] = [
  // Indices & volatility
  { id: "SPX", label: "S&P 500", class: "equity-index" },
  { id: "NDX", label: "Nasdaq 100", class: "equity-index" },
  { id: "RUT", label: "Russell 2000 (small caps)", class: "equity-index" },
  { id: "VIX", label: "Volatility (VIX)", class: "volatility" },
  // International indices
  { id: "DAX", label: "DAX (Germany)", class: "equity-index" },
  { id: "NIKKEI", label: "Nikkei 225 (Japan)", class: "equity-index" },
  // Sector ETFs
  { id: "XLK", label: "Technology (XLK)", class: "equity-sector" },
  { id: "SMH", label: "Semiconductors (SMH)", class: "equity-sector" },
  { id: "XLE", label: "Energy (XLE)", class: "equity-sector" },
  { id: "XLF", label: "Financials (XLF)", class: "equity-sector" },
  { id: "XLV", label: "Health Care (XLV)", class: "equity-sector" },
  // Single names
  { id: "NVDA", label: "NVIDIA", class: "equity-single" },
  { id: "AAPL", label: "Apple", class: "equity-single" },
  { id: "MSFT", label: "Microsoft", class: "equity-single" },
  { id: "GOOGL", label: "Alphabet", class: "equity-single" },
  { id: "AMZN", label: "Amazon", class: "equity-single" },
  { id: "META", label: "Meta", class: "equity-single" },
  { id: "TSLA", label: "Tesla", class: "equity-single" },
  // Rates (US Treasury curve)
  { id: "US2Y", label: "US 2Y Treasury", class: "rates" },
  { id: "US5Y", label: "US 5Y Treasury", class: "rates" },
  { id: "US10Y", label: "US 10Y Treasury", class: "rates" },
  { id: "US30Y", label: "US 30Y Treasury", class: "rates" },
  // FX
  { id: "USD", label: "US Dollar (DXY)", class: "fx" },
  { id: "EURUSD", label: "EUR/USD", class: "fx" },
  { id: "GBPUSD", label: "GBP/USD", class: "fx" },
  { id: "USDJPY", label: "USD/JPY", class: "fx" },
  // Commodities
  { id: "GOLD", label: "Gold", class: "metal" },
  { id: "SILVER", label: "Silver", class: "metal" },
  { id: "COPPER", label: "Copper", class: "metal" },
  { id: "CRUDE", label: "Crude Oil (WTI)", class: "energy" },
  { id: "NATGAS", label: "Natural Gas", class: "energy" },
  // Crypto
  { id: "BTC", label: "Bitcoin", class: "crypto" },
];

export const ASSET_IDS = ASSET_UNIVERSE.map((a) => a.id);
