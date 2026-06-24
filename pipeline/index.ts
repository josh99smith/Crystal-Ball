import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DataBundle, MarketEvent } from "../shared/schema";
import { ASSET_UNIVERSE } from "../shared/assets";
import { structuralLinksFor } from "./correlation/structural";
import { buildDigest, digestToMarkdown } from "./digest";
import { claudeConfigured, claudeOutcomes } from "./scenarios/claude";
import { heuristicOutcomes } from "./scenarios/heuristic";
import { fixtureEvents } from "./fixtures";
import { FredProvider, fredKindFromId } from "./providers/fred";
import { FinnhubProvider } from "./providers/finnhub";
import type { EventProvider } from "./providers/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../public/data");

// How far forward the pipeline ingests scheduled events. Longer horizons
// (annual/decade) lean on cyclical models added in later phases.
const HORIZON_DAYS = 730;

const PROVIDERS: EventProvider[] = [new FredProvider(), new FinnhubProvider()];

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
