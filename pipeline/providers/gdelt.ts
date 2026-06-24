import type { EventAssetLink, EventCategory, MarketEvent } from "../../shared/schema";
import type { EventProvider, FetchWindow } from "./types";

/**
 * GDELT provider (PLAN §3, §9) — free, keyless, near-real-time global news.
 * Detects *anticipated* (non-scheduled) market-relevant situations by measuring
 * recent news volume for curated themes via the GDELT DOC 2.0 timelinevol API.
 * Active themes become anticipated events (isScheduled: false), placed just
 * ahead of "now" as watch items. Inherently noisier than scheduled events.
 *
 * Docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 */

interface Topic {
  id: string;
  query: string;
  label: string;
  category: EventCategory;
  links: Array<[asset: string, strength: number]>;
}

const TOPICS: Topic[] = [
  {
    id: "opec",
    query: '(OPEC OR "oil production" OR "crude supply" OR "oil prices")',
    label: "Oil supply / OPEC",
    category: "commodity-energy",
    links: [["CRUDE", 0.8], ["USD", 0.4]],
  },
  {
    id: "tariffs",
    query: '("tariffs" OR "trade war" OR "trade tensions")',
    label: "Trade / tariffs",
    category: "political",
    links: [["SPX", 0.6], ["NDX", 0.6], ["USD", 0.5]],
  },
  {
    id: "geopolitical",
    query: '("military strike" OR "armed conflict" OR "sanctions" OR "war escalation")',
    label: "Geopolitical tension",
    category: "geopolitical",
    links: [["GOLD", 0.7], ["CRUDE", 0.6], ["USD", 0.5], ["SPX", 0.5]],
  },
  {
    id: "cryptoreg",
    query: '("crypto regulation" OR "bitcoin ETF" OR "SEC crypto")',
    label: "Crypto / regulation",
    category: "crypto",
    links: [["BTC", 0.85]],
  },
];

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

interface TimelineVolResponse {
  timeline?: Array<{ data?: Array<{ value: number }> }>;
}

/** Max recent news volume for a theme (0 if no/failed data). */
async function themeSalience(query: string): Promise<number> {
  const url = new URL(GDELT_BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "timelinevol");
  url.searchParams.set("timespan", "3d");
  url.searchParams.set("format", "json");
  try {
    const res = await fetch(url);
    if (!res.ok) return 0;
    const body = (await res.json()) as TimelineVolResponse;
    const data = body.timeline?.[0]?.data ?? [];
    return data.reduce((m, d) => Math.max(m, d.value || 0), 0);
  } catch {
    return 0;
  }
}

export class GdeltProvider implements EventProvider {
  id = "gdelt";

  isConfigured(): boolean {
    return true; // keyless
  }

  async fetchEvents(window: FetchWindow): Promise<MarketEvent[]> {
    const salience = await Promise.all(TOPICS.map((t) => themeSalience(t.query)));
    const maxSal = Math.max(0, ...salience);
    if (maxSal === 0) {
      console.warn("[gdelt] no news volume returned — skipping");
      return [];
    }

    // Anticipated watch items sit just ahead of "now" so they stay visible.
    const when = new Date(window.from.getTime() + 18 * 60 * 60 * 1000);
    const date = when.toISOString().slice(0, 10);

    return TOPICS.flatMap((t, i) => {
      const sal = salience[i];
      if (sal <= 0) return [];
      const links: EventAssetLink[] = t.links.map(([asset, strength]) => ({
        asset,
        tier: "structural",
        strength,
      }));
      return [
        {
          id: `gdelt-${t.id}-${date}`,
          title: `${t.label} — elevated news flow`,
          category: t.category,
          scheduledAt: when.toISOString(),
          isScheduled: false, // anticipated, uncertain timing
          expectedImpact: Math.round((0.45 + 0.4 * (sal / maxSal)) * 100) / 100,
          source: this.id,
          links,
        },
      ];
    });
  }
}
