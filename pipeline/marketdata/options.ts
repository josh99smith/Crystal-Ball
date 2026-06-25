import type { ImpliedMove } from "../../shared/schema";

// Options-implied earnings move (PLAN-V4 §2.5). The at-the-money straddle
// (ATM call + ATM put) prices the market's expected absolute move by expiry:
// impliedMove% ≈ (callMid + putMid) / spot × 100. Free-ish via Yahoo's options
// endpoint; defensive everywhere since it's undocumented and flaky.

export interface OptionQuote {
  strike: number;
  bid?: number;
  ask?: number;
  lastPrice?: number;
}

/** Mid price, falling back to lastPrice when there's no two-sided quote. */
function mid(o: OptionQuote): number | null {
  if (o.bid != null && o.ask != null && o.bid > 0 && o.ask > 0) return (o.bid + o.ask) / 2;
  if (o.lastPrice != null && o.lastPrice > 0) return o.lastPrice;
  return null;
}

function nearestToSpot(quotes: OptionQuote[], spot: number): OptionQuote | null {
  let best: OptionQuote | null = null;
  let bestDist = Infinity;
  for (const q of quotes) {
    const d = Math.abs(q.strike - spot);
    if (d < bestDist) {
      bestDist = d;
      best = q;
    }
  }
  return best;
}

/**
 * Pure: expected move % from a chain. Picks the ATM call and put (strike nearest
 * spot) and returns (callMid + putMid) / spot × 100, rounded. null if the chain
 * is too thin to price.
 */
export function impliedMoveFromChain(
  spot: number,
  calls: OptionQuote[],
  puts: OptionQuote[],
): number | null {
  if (!(spot > 0) || calls.length === 0 || puts.length === 0) return null;
  const call = nearestToSpot(calls, spot);
  const put = nearestToSpot(puts, spot);
  if (!call || !put) return null;
  const cm = mid(call);
  const pm = mid(put);
  if (cm == null || pm == null) return null;
  const pct = ((cm + pm) / spot) * 100;
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return null; // sanity guard
  return Math.round(pct * 10) / 10;
}

interface YahooOptions {
  optionChain?: {
    result?: Array<{
      quote?: { regularMarketPrice?: number };
      options?: Array<{
        expirationDate?: number;
        calls?: OptionQuote[];
        puts?: OptionQuote[];
      }>;
    }>;
  };
}

/** Fetch the nearest-expiry ATM-straddle implied move for a ticker. null on any failure. */
export async function fetchImpliedMove(ticker: string): Promise<ImpliedMove | null> {
  const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) {
      console.warn(`[options] ${ticker}: HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as YahooOptions;
    const r = body.optionChain?.result?.[0];
    const spot = r?.quote?.regularMarketPrice;
    const chain = r?.options?.[0];
    if (spot == null || !chain?.calls || !chain?.puts) return null;
    const movePct = impliedMoveFromChain(spot, chain.calls, chain.puts);
    if (movePct == null) return null;
    const expiry = chain.expirationDate
      ? new Date(chain.expirationDate * 1000).toISOString().slice(0, 10)
      : "nearest";
    return { movePct, expiry, basis: "nearest-expiry ATM straddle (Yahoo)" };
  } catch (err) {
    console.warn(`[options] ${ticker}: ${(err as Error).message}`);
    return null;
  }
}
