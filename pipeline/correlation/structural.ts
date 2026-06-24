import type { EventAssetLink } from "../../shared/schema";

/**
 * Curated structural correlation map (PLAN §7, tier "structural").
 *
 * Keyed by an event "kind" — a stable identifier the providers tag events with.
 * These are the economically obvious links; the historical/statistical tier is
 * added later (Phase 3) from event-study analysis.
 */
const STRUCTURAL_LINKS: Record<string, Array<[asset: string, strength: number]>> = {
  // FOMC rate decision — the broadest monetary-policy driver.
  fomc: [
    ["US10Y", 0.9],
    ["US2Y", 0.9],
    ["USD", 0.8],
    ["EURUSD", 0.7],
    ["SPX", 0.8],
    ["NDX", 0.78],
    ["XLK", 0.7],
    ["SMH", 0.65],
    ["VIX", 0.7],
    ["GOLD", 0.65],
    ["BTC", 0.5],
  ],
  // ECB rate decision.
  ecb: [
    ["EURUSD", 0.85],
    ["USD", 0.6],
    ["GOLD", 0.5],
    ["SPX", 0.45],
    ["XLK", 0.4],
    ["VIX", 0.45],
  ],
  // Bank of Japan decision (yen / carry → global risk).
  boj: [
    ["USD", 0.55],
    ["SPX", 0.5],
    ["NDX", 0.5],
    ["XLK", 0.45],
    ["GOLD", 0.45],
    ["VIX", 0.45],
  ],
  // US Consumer Price Index — inflation print: rates, USD, gold, broad equities.
  "us-cpi": [
    ["US10Y", 0.85],
    ["US2Y", 0.82],
    ["SPX", 0.8],
    ["NDX", 0.78],
    ["XLK", 0.7],
    ["VIX", 0.62],
    ["USD", 0.7],
    ["EURUSD", 0.55],
    ["GOLD", 0.6],
    ["BTC", 0.4],
  ],
  // Employment Situation (Nonfarm Payrolls).
  "us-nfp": [
    ["US10Y", 0.8],
    ["US2Y", 0.78],
    ["SPX", 0.75],
    ["NDX", 0.72],
    ["XLK", 0.6],
    ["VIX", 0.55],
    ["USD", 0.7],
    ["GOLD", 0.55],
  ],
  // Gross Domestic Product.
  "us-gdp": [
    ["SPX", 0.6],
    ["NDX", 0.55],
    ["XLE", 0.45],
    ["US10Y", 0.6],
    ["US2Y", 0.55],
    ["USD", 0.5],
  ],
  // Personal Income & Outlays (contains PCE, the Fed's preferred inflation gauge).
  "us-pce": [
    ["US10Y", 0.78],
    ["US2Y", 0.75],
    ["SPX", 0.7],
    ["XLK", 0.6],
    ["VIX", 0.55],
    ["USD", 0.65],
    ["GOLD", 0.55],
  ],
};

/** Returns the curated structural links for an event kind (empty if unknown). */
export function structuralLinksFor(kind: string): EventAssetLink[] {
  const entries = STRUCTURAL_LINKS[kind] ?? [];
  return entries.map(([asset, strength]) => ({
    asset,
    tier: "structural",
    strength,
  }));
}

/**
 * Structural links for a single-name earnings event: the ticker itself plus the
 * indices it carries weight in. Only emits links for assets in the v1 universe.
 */
export function earningsLinksFor(ticker: string): EventAssetLink[] {
  const links: EventAssetLink[] = [
    { asset: ticker, tier: "structural", strength: 0.95 },
  ];
  // Megacaps move the cap-weighted indices and their sector ETF.
  const indexWeight: Record<string, Array<[string, number]>> = {
    NVDA: [["NDX", 0.55], ["SPX", 0.5], ["SMH", 0.6], ["XLK", 0.45]],
    AAPL: [["NDX", 0.55], ["SPX", 0.5], ["XLK", 0.5]],
    MSFT: [["NDX", 0.55], ["SPX", 0.5], ["XLK", 0.5]],
    GOOGL: [["NDX", 0.5], ["SPX", 0.45], ["XLK", 0.45]],
    AMZN: [["NDX", 0.5], ["SPX", 0.45]],
    META: [["NDX", 0.5], ["SPX", 0.45], ["XLK", 0.4]],
    TSLA: [["NDX", 0.5], ["SPX", 0.45]],
  };
  for (const [asset, strength] of indexWeight[ticker] ?? []) {
    links.push({ asset, tier: "structural", strength });
  }
  return links;
}
