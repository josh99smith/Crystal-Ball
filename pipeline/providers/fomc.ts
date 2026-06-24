import type { MarketEvent } from "../../shared/schema";
import { structuralLinksFor } from "../correlation/structural";
import type { EventProvider, FetchWindow } from "./types";

/**
 * FOMC provider (PLAN §3, monetary-policy) — the highest-impact category.
 * Meeting decision dates are public and published ~2 years out, so they're
 * curated here (no API/key). Maintain this list as the Fed publishes new dates.
 *
 * Dates are the decision day (statement ~2:00pm ET). Also exported for the
 * event-study pipeline (historical correlation tier).
 */

// FOMC decision dates (YYYY-MM-DD). 2021–2025 are historical; 2026–2027 scheduled.
export const FOMC_DECISION_DATES: string[] = [
  "2021-01-27", "2021-03-17", "2021-04-28", "2021-06-16", "2021-07-28", "2021-09-22", "2021-11-03", "2021-12-15",
  "2022-01-26", "2022-03-16", "2022-05-04", "2022-06-15", "2022-07-27", "2022-09-21", "2022-11-02", "2022-12-14",
  "2023-02-01", "2023-03-22", "2023-05-03", "2023-06-14", "2023-07-26", "2023-09-20", "2023-11-01", "2023-12-13",
  "2024-01-31", "2024-03-20", "2024-05-01", "2024-06-12", "2024-07-31", "2024-09-18", "2024-11-07", "2024-12-18",
  "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10",
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-11-04", "2026-12-16",
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-16", "2027-07-28", "2027-09-22", "2027-11-03", "2027-12-15",
];

export class FomcProvider implements EventProvider {
  id = "fomc";

  isConfigured(): boolean {
    return true; // curated dates
  }

  async fetchEvents(window: FetchWindow): Promise<MarketEvent[]> {
    return FOMC_DECISION_DATES.flatMap((date) => {
      const when = new Date(`${date}T18:00:00Z`); // ~2:00pm ET
      if (when < window.from || when > window.to) return [];
      return [
        {
          id: `fomc-${date}`,
          title: "FOMC rate decision",
          category: "monetary-policy" as const,
          scheduledAt: when.toISOString(),
          isScheduled: true,
          expectedImpact: 0.9,
          source: this.id,
          links: structuralLinksFor("fomc"),
        },
      ];
    });
  }
}
