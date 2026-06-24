import { useEffect, useState } from "react";

export interface CryptoQuote {
  usd: number;
  change24h: number;
}

/**
 * Live BTC price from CoinGecko — keyless and CORS-friendly, so it runs
 * client-side for genuine real-time data (PLAN §4, static-hosting model).
 * Polls every 60s. Returns null until the first successful fetch.
 */
export function useCryptoTicker(): CryptoQuote | null {
  const [quote, setQuote] = useState<CryptoQuote | null>(null);

  useEffect(() => {
    let active = true;
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";

    const load = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const btc = data?.bitcoin;
        if (active && btc) {
          setQuote({ usd: btc.usd, change24h: btc.usd_24h_change ?? 0 });
        }
      } catch {
        /* offline / rate-limited — keep last value */
      }
    };

    load();
    const timer = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return quote;
}
