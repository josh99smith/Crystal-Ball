import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CalibrationRow,
  DataBundle,
  EventAssetLink,
  MarketEvent,
} from "../shared/schema";
import { SCHEMA_VERSION } from "../shared/schema";
import { ASSET_IDS, ASSET_UNIVERSE } from "../shared/assets";
import { structuralLinksFor } from "./correlation/structural";
import { historicalLinks, sampleHistoricalLinks } from "./correlation/historical";
import {
  assetsNeedingResolution,
  buildPredictions,
  computeMetrics,
  mergeLedger,
  resolveDue,
  type LedgerRecord,
} from "./calibration";
import { buildDigest, digestToMarkdown } from "./digest";
import { fetchDailyCloses, type PriceBar } from "./marketdata/stooq";
import { claudeConfigured, claudeOutcomes } from "./scenarios/claude";
import { heuristicOutcomes } from "./scenarios/heuristic";
import { fetchRateContext, fomcOutcomesFromRates } from "./scenarios/weighting";
import { fixtureEvents } from "./fixtures";
import { FredProvider, fredKindFromId, RELEASES } from "./providers/fred";
import { FinnhubProvider } from "./providers/finnhub";
import { MarketStructureProvider } from "./providers/marketstructure";
import { FomcProvider, FOMC_DECISION_DATES } from "./providers/fomc";
import { GdeltProvider } from "./providers/gdelt";
import { CentralBankProvider, bankPastDates, BANK_LABELS } from "./providers/centralbanks";
import type { EventProvider } from "./providers/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../public/data");

// How far forward the pipeline ingests scheduled events. Longer horizons
// (annual/decade) lean on cyclical models added in later phases.
const HORIZON_DAYS = 730;
// How far back the event-study pipeline looks for past event occurrences.
const STUDY_YEARS = 6;

const fred = new FredProvider();
// Keyed providers gate on API keys; computed providers are always available.
const KEYED_PROVIDERS: EventProvider[] = [fred, new FinnhubProvider()];
const COMPUTED_PROVIDERS: EventProvider[] = [
  new MarketStructureProvider(),
  new FomcProvider(),
  new CentralBankProvider(),
  new GdeltProvider(),
];

const KIND_LABEL = new Map<string, string>([
  ...RELEASES.map((r) => [r.kind, r.title] as [string, string]),
  ["fomc", "FOMC rate decision"],
  ...Object.entries(BANK_LABELS),
]);

/** Correlation "kind" for an event (FRED releases, fixtures, FOMC, ECB, BoJ). */
function kindOf(event: MarketEvent): string | undefined {
  if (event.id.startsWith("fomc-")) return "fomc";
  if (event.id.startsWith("ecb-")) return "ecb";
  if (event.id.startsWith("boj-")) return "boj";
  return fredKindFromId(event.id);
}

/** Past occurrence dates for an event kind, for the event study. */
async function pastDatesFor(kind: string, from: Date, to: Date): Promise<string[]> {
  if (kind === "fomc") {
    return FOMC_DECISION_DATES.filter((d) => {
      const t = new Date(`${d}T18:00:00Z`);
      return t >= from && t <= to;
    });
  }
  if (kind === "ecb" || kind === "boj") return bankPastDates(kind, from, to);
  const rel = RELEASES.find((r) => r.kind === kind);
  return rel ? fred.releaseDates(rel.releaseId, from, to) : [];
}

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

  // Market-implied FOMC weights from Treasury rates (free), when available.
  let rateCtx = null;
  if (fred.isConfigured() && events.some((e) => e.category === "monetary-policy")) {
    rateCtx = await fetchRateContext(fred);
    console.log(`[pipeline] FOMC weights: ${rateCtx ? "Treasury-implied" : "heuristic (no rate data)"}`);
  }

  const generate = async (event: MarketEvent) => {
    // FOMC: prefer market-based weights over the LLM/heuristic.
    if (event.category === "monetary-policy" && rateCtx) {
      return { ...event, outcomes: fomcOutcomesFromRates(event, rateCtx) };
    }
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

interface HistoricalResult {
  events: MarketEvent[];
  calibration: CalibrationRow[];
}

/** Flattens per-kind historical links into calibration scorecard rows. */
function toCalibration(linksByKind: Map<string, EventAssetLink[]>): CalibrationRow[] {
  const rows: CalibrationRow[] = [];
  for (const [kind, links] of linksByKind) {
    for (const l of links) {
      if (!l.stats) continue;
      rows.push({
        kind,
        kindLabel: KIND_LABEL.get(kind) ?? kind,
        asset: l.asset,
        n: l.stats.n,
        avgAbsMovePct: l.stats.avgAbsMovePct,
        directionHitRate: l.stats.directionHitRate,
        strength: l.strength,
      });
    }
  }
  return rows.sort((a, b) => b.strength - a.strength);
}

/**
 * Adds the historical (statistical) correlation tier (PLAN §7) and the
 * calibration scorecard (Phase 4). With real data (FRED past dates + Stooq
 * prices) it runs an event study per kind; otherwise it attaches deterministic
 * sample stats so the tier and scorecard are visible in the demo.
 */
async function addHistorical(events: MarketEvent[], now: Date): Promise<HistoricalResult> {
  if (!fred.isConfigured()) {
    console.log("[pipeline] historical tier: sample (no FRED key)");
    const withLinks = events.map((e) => ({
      ...e,
      links: [...e.links, ...sampleHistoricalLinks(e)],
    }));
    // One representative event per kind seeds the sample scorecard.
    const byKind = new Map<string, EventAssetLink[]>();
    for (const e of withLinks) {
      const kind = kindOf(e);
      if (kind && !byKind.has(kind)) {
        byKind.set(kind, e.links.filter((l) => l.tier === "historical"));
      }
    }
    return { events: withLinks, calibration: toCalibration(byKind) };
  }

  const from = new Date(now.getTime() - STUDY_YEARS * 365 * 24 * 60 * 60 * 1000);
  const kinds = new Set(
    events.map((e) => kindOf(e)).filter((k): k is string => !!k),
  );
  if (kinds.size === 0) return { events, calibration: [] };

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
    return { events, calibration: [] };
  }

  // Event study per kind.
  const linksByKind = new Map<string, EventAssetLink[]>();
  for (const kind of kinds) {
    const dates = await pastDatesFor(kind, from, now);
    if (dates.length) linksByKind.set(kind, historicalLinks(dates, pricesByAsset, now));
  }

  console.log(`[pipeline] historical tier: event study over ${pricesByAsset.size} assets`);
  const withLinks = events.map((e) => {
    const kind = kindOf(e);
    const hist = kind ? linksByKind.get(kind) ?? [] : [];
    return { ...e, links: [...e.links, ...hist] };
  });
  return { events: withLinks, calibration: toCalibration(linksByKind) };
}

// Published site, used to read the previous predictions ledger so calibration
// accrues across runs (no source-branch commits needed).
const SITE_URL = process.env.SITE_URL ?? "https://josh99smith.github.io/Crystal-Ball";

async function loadLedger(): Promise<LedgerRecord[]> {
  try {
    const res = await fetch(`${SITE_URL}/data/predictions-log.json`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as LedgerRecord[]) : [];
  } catch {
    return [];
  }
}

/**
 * Calibration loop (PLAN-V2 §2.4): log directional predictions, resolve due ones
 * from free prices, score, and persist the ledger to the published bundle.
 */
async function runCalibrationLoop(events: MarketEvent[], now: Date) {
  const prev = await loadLedger();
  let ledger = mergeLedger(prev, buildPredictions(events, now));

  const need = assetsNeedingResolution(ledger, now);
  if (need.length) {
    const from = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);
    const prices = new Map<string, PriceBar[]>();
    await Promise.all(
      need.map(async (id) => {
        const bars = await fetchDailyCloses(id, from, now);
        if (bars.length) prices.set(id, bars);
      }),
    );
    ledger = resolveDue(ledger, now, prices);
  }

  const metrics = computeMetrics(ledger, now);
  await writeFile(
    resolve(DATA_DIR, "predictions-log.json"),
    JSON.stringify(ledger, null, 2) + "\n",
  );
  console.log(
    `[pipeline] calibration loop: ${metrics.resolved} resolved, ${metrics.pending} pending (ledger ${ledger.length})`,
  );
  return metrics;
}

async function main() {
  const now = new Date();
  const window = {
    from: now,
    to: new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000),
  };

  // Keyed providers first; fall back to fixtures if none returned data.
  let events: MarketEvent[] = [];
  for (const provider of KEYED_PROVIDERS) {
    if (!provider.isConfigured()) {
      console.warn(`[pipeline] provider "${provider.id}" not configured — skipping`);
      continue;
    }
    const fetched = await provider.fetchEvents(window);
    console.log(`[pipeline] provider "${provider.id}" returned ${fetched.length} events`);
    events.push(...fetched);
  }
  if (events.length === 0) {
    console.warn("[pipeline] no keyed provider data — using fixtures");
    events = fixtureEvents(now);
  }

  // Computed providers (no key) always contribute.
  for (const provider of COMPUTED_PROVIDERS) {
    const fetched = await provider.fetchEvents(window);
    console.log(`[pipeline] provider "${provider.id}" returned ${fetched.length} events`);
    events.push(...fetched);
  }

  events = attachLinks(events).sort(
    (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
  );

  events = await addScenarios(events);
  const historical = await addHistorical(events, now);
  events = historical.events;

  const digest = buildDigest(events, now);
  const calibrationLoop = await runCalibrationLoop(events, now);

  const bundle: DataBundle = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    assets: ASSET_UNIVERSE,
    events,
    digest,
    calibration: historical.calibration,
    calibrationLoop,
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
