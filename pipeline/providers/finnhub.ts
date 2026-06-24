import type { MarketEvent } from "../../shared/schema";
import { earningsLinksFor } from "../correlation/structural";
import type { EventProvider, FetchWindow } from "./types";

/**
 * Finnhub earnings-calendar provider (PLAN §9, free tier). Pulls upcoming
 * earnings dates for the v1 single-name tickers. Requires FINNHUB_API_KEY;
 * returns [] when unconfigured.
 *
 * Docs: https://finnhub.io/docs/api/earnings-calendar
 */

// v1 single-name tickers we track earnings for.
const TICKERS = ["NVDA", "AAPL", "MSFT"];

const FINNHUB_BASE = "https://finnhub.io/api/v1";

interface EarningsCalendarResponse {
  earningsCalendar?: Array<{
    date: string;
    symbol: string;
    hour?: string; // "bmo" | "amc" | "dmh" | ""
  }>;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Map Finnhub's session hint to an approximate UTC time.
function timeForHour(date: string, hour?: string): string {
  // amc = after market close (~20:30 UTC), bmo = before open (~11:30 UTC)
  const t = hour === "amc" ? "20:30:00Z" : "11:30:00Z";
  return new Date(`${date}T${t}`).toISOString();
}

export class FinnhubProvider implements EventProvider {
  id = "finnhub";

  private apiKey = process.env.FINNHUB_API_KEY ?? "";

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async fetchEvents(window: FetchWindow): Promise<MarketEvent[]> {
    if (!this.isConfigured()) return [];

    const url = new URL(`${FINNHUB_BASE}/calendar/earnings`);
    url.searchParams.set("from", isoDate(window.from));
    url.searchParams.set("to", isoDate(window.to));
    url.searchParams.set("token", this.apiKey);

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[finnhub] earnings: HTTP ${res.status}`);
        return [];
      }
      const body = (await res.json()) as EarningsCalendarResponse;
      const tracked = new Set(TICKERS);

      return (body.earningsCalendar ?? [])
        .filter((row) => tracked.has(row.symbol))
        .map((row) => ({
          id: `finnhub-earnings-${row.symbol}-${row.date}`,
          title: `${row.symbol} earnings`,
          category: "earnings" as const,
          scheduledAt: timeForHour(row.date, row.hour),
          isScheduled: true,
          expectedImpact: 0.7,
          source: this.id,
          links: earningsLinksFor(row.symbol), // provider knows the ticker
        }));
    } catch (err) {
      console.warn(`[finnhub] earnings: ${(err as Error).message}`);
      return [];
    }
  }
}
