/**
 * Stooq market-data fetcher — free, keyless daily OHLC via CSV download
 * (PLAN §9). Used by the event-study pipeline (Phase 3). Symbols are best-effort;
 * a failed/unknown symbol yields an empty series so the study simply skips that
 * asset rather than failing the run.
 *
 * Example: https://stooq.com/q/d/l/?s=^spx&i=d&d1=20200101&d2=20260101
 */

export interface PriceBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

// v1 asset id → Stooq symbol (best-effort; expand/verify as the universe grows).
const STOOQ_SYMBOL: Record<string, string> = {
  SPX: "^spx",
  NDX: "^ndx",
  NVDA: "nvda.us",
  AAPL: "aapl.us",
  MSFT: "msft.us",
  US10Y: "^tnx", // 10Y yield index
  USD: "dx.f", // US Dollar index futures
  GOLD: "xauusd",
  CRUDE: "cl.f", // WTI futures
  BTC: "btcusd",
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Fetches daily closes for an asset between two dates (ascending). [] on failure. */
export async function fetchDailyCloses(
  assetId: string,
  from: Date,
  to: Date,
): Promise<PriceBar[]> {
  const symbol = STOOQ_SYMBOL[assetId];
  if (!symbol) return [];

  const url =
    `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d` +
    `&d1=${ymd(from)}&d2=${ymd(to)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[stooq] ${assetId} (${symbol}): HTTP ${res.status}`);
      return [];
    }
    const text = await res.text();
    // CSV header: Date,Open,High,Low,Close,Volume
    const lines = text.trim().split("\n");
    if (lines.length < 2 || !/^Date,/i.test(lines[0])) return [];

    const bars: PriceBar[] = [];
    for (const line of lines.slice(1)) {
      const cols = line.split(",");
      const date = cols[0];
      const open = Number(cols[1]);
      const high = Number(cols[2]);
      const low = Number(cols[3]);
      const close = Number(cols[4]);
      if (date && Number.isFinite(close)) {
        bars.push({
          date,
          open: Number.isFinite(open) ? open : close,
          high: Number.isFinite(high) ? high : close,
          low: Number.isFinite(low) ? low : close,
          close,
        });
      }
    }
    bars.sort((a, b) => a.date.localeCompare(b.date));
    return bars;
  } catch (err) {
    console.warn(`[stooq] ${assetId} (${symbol}): ${(err as Error).message}`);
    return [];
  }
}
