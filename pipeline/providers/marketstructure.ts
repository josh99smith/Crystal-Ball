import type { MarketEvent } from "../../shared/schema";
import type { EventProvider, FetchWindow } from "./types";

/**
 * Market-structure provider (PLAN §3) — fully computed, no API/key needed.
 * Emits monthly options expiry (3rd Friday) and quarterly triple witching
 * (3rd Friday of Mar/Jun/Sep/Dec). Always available, so the timeline has real
 * upcoming events even with no data keys configured.
 */

/** The 3rd Friday of a given year/month (month 0-based), at ~market close UTC. */
function thirdFriday(year: number, month: number): Date {
  let fridays = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(Date.UTC(year, month, day, 20, 0, 0));
    if (d.getUTCMonth() !== month) break;
    if (d.getUTCDay() === 5 && ++fridays === 3) return d;
  }
  return new Date(Date.UTC(year, month, 21, 20, 0, 0)); // fallback
}

const QUARTER_MONTHS = new Set([2, 5, 8, 11]); // Mar, Jun, Sep, Dec (0-based)

export class MarketStructureProvider implements EventProvider {
  id = "market-structure";

  isConfigured(): boolean {
    return true; // computed
  }

  async fetchEvents(window: FetchWindow): Promise<MarketEvent[]> {
    const events: MarketEvent[] = [];
    const cursor = new Date(
      Date.UTC(window.from.getUTCFullYear(), window.from.getUTCMonth(), 1),
    );

    while (cursor <= window.to) {
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth();
      const when = thirdFriday(y, m);

      if (when >= window.from && when <= window.to) {
        const tw = QUARTER_MONTHS.has(m);
        const date = when.toISOString().slice(0, 10);
        events.push({
          id: `mktstruct-${tw ? "tw" : "opex"}-${date}`,
          title: tw ? "Triple witching" : "Monthly options expiry (OpEx)",
          category: "market-structure",
          scheduledAt: when.toISOString(),
          isScheduled: true,
          expectedImpact: tw ? 0.6 : 0.4,
          source: this.id,
          links: [
            { asset: "SPX", tier: "structural", strength: tw ? 0.55 : 0.45 },
            { asset: "NDX", tier: "structural", strength: tw ? 0.5 : 0.4 },
          ],
        });
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return events;
  }
}
