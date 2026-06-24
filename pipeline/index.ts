import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DataBundle, MarketEvent } from "../shared/schema";
import { ASSET_UNIVERSE } from "../shared/assets";
import { structuralLinksFor } from "./correlation/structural";
import { fixtureEvents } from "./fixtures";
import { FredProvider, fredKindFromId } from "./providers/fred";
import type { EventProvider } from "./providers/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, "../public/data/events.json");

// How far forward the pipeline ingests scheduled events. Longer horizons
// (annual/decade) lean on cyclical models added in later phases.
const HORIZON_DAYS = 730;

const PROVIDERS: EventProvider[] = [new FredProvider()];

/** Recover an event's correlation "kind" from its id (provider-specific). */
function kindFor(event: MarketEvent): string | undefined {
  if (event.source === "fred" || event.source === "fixture") {
    return fredKindFromId(event.id);
  }
  return undefined;
}

function attachLinks(events: MarketEvent[]): MarketEvent[] {
  return events.map((event) => {
    const kind = kindFor(event);
    return { ...event, links: kind ? structuralLinksFor(kind) : event.links };
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

  const bundle: DataBundle = {
    generatedAt: now.toISOString(),
    assets: ASSET_UNIVERSE,
    events,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(bundle, null, 2) + "\n");
  console.log(`[pipeline] wrote ${events.length} events → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
