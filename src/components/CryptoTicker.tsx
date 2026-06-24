import { useCryptoTicker } from "../useCryptoTicker";

/** Live BTC price badge (real-time, fetched client-side). */
export function CryptoTicker() {
  const quote = useCryptoTicker();
  if (!quote) return null;

  const up = quote.change24h >= 0;
  return (
    <div className="ticker" title="Live BTC price · CoinGecko">
      <span className="ticker-sym">BTC</span>
      <span className="ticker-price">
        ${quote.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </span>
      <span className={up ? "ticker-chg up" : "ticker-chg down"}>
        {up ? "▲" : "▼"} {Math.abs(quote.change24h).toFixed(2)}%
      </span>
      <span className="ticker-live" aria-label="live" />
    </div>
  );
}
