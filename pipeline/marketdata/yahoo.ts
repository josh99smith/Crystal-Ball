import type { PriceBar } from "./stooq";
import { fetchDailyCloses as stooqFetch } from "./stooq";

/**
 * Yahoo Finance daily history — used in CI because Stooq blocks cloud/datacenter
 * IPs (so it returns nothing from GitHub Actions). Yahoo's chart endpoint is
 * keyless and generally reachable server-side. Falls back to Stooq if Yahoo
 * fails for a symbol.
 */

const YAHOO_SYMBOL: Record<string, string> = {
  SPX: "^GSPC",
  NDX: "^NDX",
  VIX: "^VIX",
  XLK: "XLK",
  SMH: "SMH",
  XLE: "XLE",
  NVDA: "NVDA",
  AAPL: "AAPL",
  MSFT: "MSFT",
  GOOGL: "GOOGL",
  AMZN: "AMZN",
  META: "META",
  TSLA: "TSLA",
  US10Y: "^TNX",
  // US2Y has no clean Yahoo ^ ticker; left to the Stooq fallback.
  USD: "DX-Y.NYB",
  EURUSD: "EURUSD=X",
  GOLD: "GC=F",
  CRUDE: "CL=F",
  BTC: "BTC-USD",
};

interface YahooChart {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }> };
    }>;
  };
}

export async function fetchDailyCloses(
  assetId: string,
  from: Date,
  to: Date,
): Promise<PriceBar[]> {
  const sym = YAHOO_SYMBOL[assetId];
  if (sym) {
    const p1 = Math.floor(from.getTime() / 1000);
    const p2 = Math.floor(to.getTime() / 1000);
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
      `?period1=${p1}&period2=${p2}&interval=1d`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (res.ok) {
        const body = (await res.json()) as YahooChart;
        const r = body.chart?.result?.[0];
        const ts = r?.timestamp;
        const q = r?.indicators?.quote?.[0];
        if (ts && q?.close) {
          const bars: PriceBar[] = [];
          for (let i = 0; i < ts.length; i++) {
            const c = q.close[i];
            if (c == null) continue;
            bars.push({
              date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
              open: q.open?.[i] ?? c,
              high: q.high?.[i] ?? c,
              low: q.low?.[i] ?? c,
              close: c,
            });
          }
          if (bars.length) return bars;
        }
      } else {
        console.warn(`[yahoo] ${assetId} (${sym}): HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn(`[yahoo] ${assetId} (${sym}): ${(err as Error).message}`);
    }
  }
  return stooqFetch(assetId, from, to); // fallback
}
