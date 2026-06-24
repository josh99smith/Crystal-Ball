import type { EventCategory, MarketEvent } from "../../shared/schema";
import type { EventProvider, FetchWindow } from "./types";

/**
 * FRED (Federal Reserve Economic Data) provider — the first free source
 * (PLAN §9). Uses the `release/dates` endpoint, which publishes *upcoming*
 * scheduled release dates for economic data series.
 *
 * Requires a free API key in the FRED_API_KEY env var. When absent the provider
 * reports itself unconfigured and returns no events (the pipeline then falls
 * back to fixtures).
 *
 * Docs: https://fred.stlouisfed.org/docs/api/fred/release_dates.html
 */

interface ReleaseConfig {
  /** FRED release_id. */
  releaseId: number;
  /** Event "kind" used to look up structural correlation links. */
  kind: string;
  title: string;
  category: EventCategory;
  expectedImpact: number;
}

// Curated high-impact economic releases (expand later).
const RELEASES: ReleaseConfig[] = [
  { releaseId: 10, kind: "us-cpi", title: "US CPI", category: "economic-data", expectedImpact: 0.85 },
  { releaseId: 50, kind: "us-nfp", title: "US Employment Situation (NFP)", category: "economic-data", expectedImpact: 0.85 },
  { releaseId: 53, kind: "us-gdp", title: "US GDP", category: "economic-data", expectedImpact: 0.7 },
  { releaseId: 54, kind: "us-pce", title: "US Personal Income & Outlays (PCE)", category: "economic-data", expectedImpact: 0.75 },
];

const FRED_BASE = "https://api.stlouisfed.org/fred";

interface FredReleaseDatesResponse {
  release_dates?: Array<{ release_id: number; date: string }>;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class FredProvider implements EventProvider {
  id = "fred";

  private apiKey = process.env.FRED_API_KEY ?? "";

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async fetchEvents(window: FetchWindow): Promise<MarketEvent[]> {
    if (!this.isConfigured()) return [];

    const events: MarketEvent[] = [];

    for (const release of RELEASES) {
      const url = new URL(`${FRED_BASE}/release/dates`);
      url.searchParams.set("release_id", String(release.releaseId));
      url.searchParams.set("api_key", this.apiKey);
      url.searchParams.set("file_type", "json");
      url.searchParams.set("include_release_dates_with_no_data", "true");
      url.searchParams.set("sort_order", "asc");
      url.searchParams.set("realtime_start", isoDate(window.from));
      url.searchParams.set("realtime_end", isoDate(window.to));

      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`[fred] ${release.kind}: HTTP ${res.status}`);
          continue;
        }
        const body = (await res.json()) as FredReleaseDatesResponse;
        for (const rd of body.release_dates ?? []) {
          const when = new Date(`${rd.date}T12:30:00Z`); // releases are typically 8:30am ET
          if (when < window.from || when > window.to) continue;
          events.push({
            id: `fred-${release.kind}-${rd.date}`,
            title: release.title,
            category: release.category,
            scheduledAt: when.toISOString(),
            isScheduled: true,
            expectedImpact: release.expectedImpact,
            source: this.id,
            links: [], // attached by the pipeline (kind is recovered from the id)
          });
        }
      } catch (err) {
        console.warn(`[fred] ${release.kind}: ${(err as Error).message}`);
      }
    }

    return events;
  }
}

/** Maps a FRED event id back to its kind for correlation lookup. */
export function fredKindFromId(id: string): string | undefined {
  // id shape: "fred-<kind>-<date>", kind may contain dashes (e.g. "us-cpi")
  const m = id.match(/^fred-(.+)-\d{4}-\d{2}-\d{2}$/);
  return m?.[1];
}
