import type { MarketEvent } from "../../shared/schema";
import { structuralLinksFor } from "../correlation/structural";
import type { EventProvider, FetchWindow } from "./types";

/**
 * Non-US central banks (PLAN-V2 §2.1, breadth) — ECB and BoJ rate decisions.
 * Computed from curated decision dates (no API/key), like FOMC. Dates are
 * approximate/maintainable; refine as each bank publishes its calendar.
 */

interface BankConfig {
  id: string; // event-id prefix + correlation kind
  title: string;
  dates: string[]; // YYYY-MM-DD decision dates
}

const BANKS: BankConfig[] = [
  {
    id: "ecb",
    title: "ECB rate decision",
    dates: [
      "2024-01-25", "2024-03-07", "2024-04-11", "2024-06-06", "2024-07-18", "2024-09-12", "2024-10-17", "2024-12-12",
      "2025-01-30", "2025-03-06", "2025-04-17", "2025-06-05", "2025-07-24", "2025-09-11", "2025-10-30", "2025-12-18",
      "2026-01-29", "2026-03-12", "2026-04-16", "2026-06-04", "2026-07-23", "2026-09-10", "2026-10-29", "2026-12-17",
      "2027-01-28", "2027-03-11", "2027-04-15", "2027-06-10", "2027-07-22", "2027-09-09", "2027-10-28", "2027-12-16",
    ],
  },
  {
    id: "boj",
    title: "Bank of Japan decision",
    dates: [
      "2024-01-23", "2024-03-19", "2024-04-26", "2024-06-14", "2024-07-31", "2024-09-20", "2024-10-31", "2024-12-19",
      "2025-01-24", "2025-03-19", "2025-05-01", "2025-06-17", "2025-07-31", "2025-09-19", "2025-10-30", "2025-12-19",
      "2026-01-23", "2026-03-18", "2026-04-28", "2026-06-16", "2026-07-31", "2026-09-18", "2026-10-30", "2026-12-18",
      "2027-01-22", "2027-03-18", "2027-04-27", "2027-06-15", "2027-07-29", "2027-09-21", "2027-10-28", "2027-12-17",
    ],
  },
];

/** Past decision dates for a bank kind within [from, to] (for the event study). */
export function bankPastDates(kind: string, from: Date, to: Date): string[] {
  const bank = BANKS.find((b) => b.id === kind);
  if (!bank) return [];
  return bank.dates.filter((d) => {
    const t = new Date(`${d}T12:00:00Z`).getTime();
    return t >= from.getTime() && t <= to.getTime();
  });
}

export const BANK_LABELS: Record<string, string> = Object.fromEntries(
  BANKS.map((b) => [b.id, b.title]),
);

export class CentralBankProvider implements EventProvider {
  id = "central-banks";

  isConfigured(): boolean {
    return true; // curated dates
  }

  async fetchEvents(window: FetchWindow): Promise<MarketEvent[]> {
    const events: MarketEvent[] = [];
    for (const bank of BANKS) {
      for (const date of bank.dates) {
        const when = new Date(`${date}T12:00:00Z`);
        if (when < window.from || when > window.to) continue;
        events.push({
          id: `${bank.id}-${date}`,
          title: bank.title,
          category: "monetary-policy",
          scheduledAt: when.toISOString(),
          isScheduled: true,
          expectedImpact: 0.75,
          source: this.id,
          links: structuralLinksFor(bank.id),
        });
      }
    }
    return events;
  }
}
