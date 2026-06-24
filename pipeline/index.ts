import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DataBundle, MarketEvent } from "../shared/schema";
import { ASSET_IDS, ASSET_UNIVERSE } from "../shared/assets";
import { structuralLinksFor } from "./correlation/structural";
import { historicalLinks, sampleHistoricalLinks } from "./correlation/historical";
import { buildDigest, digestToMarkdown } from "./digest";
import { fetchDailyCloses, type PriceBar } from "./marketdata/stooq";
import { claudeConfigured, claudeOutcomes } from "./scenarios/claude";
import { heuristicOutcomes } from "./scenarios/heuristic";
import { fixtureEvents } from "./fixtures";
import { FredProvider, fredKindFromId, RELEASES } from "./providers/fred";
import { FinnhubProvider } from "./providers/finnhub";
import type { EventProvider } from "./providers/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../public/data");

// How far forward the pipeline ingests scheduled events. Longer horizons
// (annual/decade) lean on cyclical models added in later phases.
const HORIZON_DAYS = 730;
// How far back the event-study pipeline looks for past event occurrences.
const STUDY_YEARS = 6;

const fred = new FredProvider();
const PROVIDERS: EventProvider[] = [fred, new FinnhubProvider()];

/** Recover an event's correlation "kind" from its id (provider-specific). */
function kindFor(event: MarketEvent): string | undefined {
  if (event.source === "fred" || event.source === "fixture") {
    return fredKindFromId(event.id);
  }
  return undefined;
}

/**
 * Attach correlation links. Providers that already know an event's links (e.g.
 * single-name earnings) keep theirs; otherwise links are looked up by kind.
 */
function attachLinks(events: MarketEvent[]): MarketEvent[] {
  return events.map((event) => {
    if (event.links.length > 0) return event;
    const kind = kindFor(event);
    return { ...event, links: kind ? structuralLinksFor(kind) : [] };
  });
}

/**
 * Adds weighted outcome scenarios to each event. Uses the Claude reasoning layer
 * when configured (falling back to the heuristic generator per-event on error),
 * otherwise the heuristic generator. Claude calls run with bounded concurrency.
 */
async function addScenarios(events: MarketEvent[]): Promise<MarketEvent[]> {
  const useClaude = claudeConfigured();
  console.log(
    `[pipeline] scenarios via ${useClaude ? "Claude" : "heuristic"} for ${events.length} events`,
  );

  const generate = async (event: MarketEvent) => {
    if (useClaude) {
      try {
        return { ...event, outcomes: await claudeOutcomes(event) };
      } catch (err) {
        console.warn(`[pipeline] Claude scenarios failed for ${event.id}: ${(err as Error).message} — heuristic`);
      }
    }
    return { ...event, outcomes: heuristicOutcomes(event) };
  };

  // Bounded concurrency to respect rate limits.
  const LIMIT = 4;
  const out: MarketEvent[] = [];
  for (let i = 0; i < events.length; i += LIMIT) {
    out.push(...(await Promise.all(events.slice(i, i + LIMIT).map(generate))));
  }
  return out;
}

/**
 * Adds the historical (statistical) correlation tier (PLAN §7). With real data
 * (FRED past dates + Stooq prices) it runs an event study per kind; otherwise it
 * attaches deterministic sample stats so the tier is visible in the demo.
 */
async function addHistorical(events: MarketEvent[], now: Date): Promise<MarketEvent[]> {
  if (!fred.isConfigured()) {
    console.log("[pipeline] historical tier: sample (no FRED key)");
    return events.map((e) => ({ ...e, links: [...e.links, ...sampleHistoricalLinks(e)] }));
  }

  const from = new Date(now.getTime() - STUDY_YEARS * 365 * 24 * 60 * 60 * 1000);
  const kinds = new Set(
    events.map((e) => fredKindFromId(e.id)).filter((k): k is string => !!k),
  );
  if (kinds.size === 0) return events;

  // Fetch each asset's price history once (reused across kinds).
  const pricesByAsset = new Map<string, PriceBar[]>();
  await Promise.all(
    ASSET_IDS.map(async (id) => {
      const bars = await fetchDailyCloses(id, from, now);
      if (bars.length) pricesByAsset.set(id, bars);
    }),
  );
  if (pricesByAsset.size === 0) {
    console.warn("[pipeline] historical tier: no price data — skipping");
    return events;
  }

  // Event study per kind.
  const linksByKind = new Map<string, Awaited<ReturnType<typeof historicalLinks>>>();
  for (const kind of kinds) {
    const rel = RELEASES.find((r) => r.kind === kind);
    if (!rel) continue;
    const dates = await fred.releaseDates(rel.releaseId, from, now);
    linksByKind.set(kind, historicalLinks(dates, pricesByAsset));
  }

  console.log(`[pipeline] historical tier: event study over ${pricesByAsset.size} assets`);
  return events.map((e) => {
    const kind = fredKindFromId(e.id);
    const hist = kind ? linksByKind.get(kind) ?? [] : [];
    return { ...e, links: [...e.links, ...hist] };
  });
}

async function main() {
  const now = new Date();
  const window = {
    from: now,
    to: new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000),
  };

  let events: MarketEvent[] = [];
  for (const provider of PROVIDERS) {
    if (!provider.isConfigured()) {
      console.warn(`[pipeline] provider "${provider.id}" not configured — skipping`);
      continue;
    }
    const fetched = await provider.fetchEvents(window);
    console.log(`[pipeline] provider "${provider.id}" returned ${fetched.length} events`);
    events.push(...fetched);
  }

  if (events.length === 0) {
    console.warn("[pipeline] no provider data — using fixtures");
    events = fixtureEvents(now);
  }

  events = attachLinks(events).sort(
    (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
  );

  events = await addScenarios(events);
  events = await addHistorical(events, now);

  const digest = buildDigest(events, now);

  const bundle: DataBundle = {
    generatedAt: now.toISOString(),
    assets: ASSET_UNIVERSE,
    events,
    digest,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    resolve(DATA_DIR, "events.json"),
    JSON.stringify(bundle, null, 2) + "\n",
  );
  await writeFile(resolve(DATA_DIR, "digest.md"), digestToMarkdown(digest));

  console.log(
    `[pipeline] wrote ${events.length} events + digest → ${DATA_DIR}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
