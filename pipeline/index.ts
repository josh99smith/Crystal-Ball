import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CalibrationRow,
  DataBundle,
  EconPrint,
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
import { buildIntelligence } from "./intelligence";
import type { PriceBar } from "./marketdata/stooq";
import { fetchDailyCloses } from "./marketdata/yahoo";
import { fetchImpliedMove } from "./marketdata/options";
import { claudeConfigured, claudeOutcomes } from "./scenarios/claude";
import { heuristicOutcomes } from "./scenarios/heuristic";
import { fetchRateContext, fomcOutcomesFromRates } from "./scenarios/weighting";
import { fixtureEvents } from "./fixtures";
import { FredProvider, fredKindFromId, RELEASES, computeRecentPrints } from "./providers/fred";
import { FinnhubProvider } from "./providers/finnhub";
import { MarketStructureProvider } from "./providers/marketstructure";
import { FomcProvider, FOMC_DECISION_DATES } from "./providers/fomc";
import { GdeltProvider } from "./providers/gdelt";
import { CentralBankProvider, bankPastDates, BANK_LABELS } from "./providers/centralbanks";
import { LunarProvider, lunarPastDates } from "./providers/lunar";
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
  new LunarProvider(),
  new GdeltProvider(),
];

const KIND_LABEL = new Map<string, string>([
  ...RELEASES.map((r) => [r.kind, r.title] as [string, string]),
  ["fomc", "FOMC rate decision"],
  ...Object.entries(BANK_LABELS),
  ["lunar-new", "New moon"],
  ["lunar-full", "Full moon"],
]);

/** Correlation "kind" for an event (FRED releases, fixtures, FOMC, ECB, BoJ, lunar). */
function kindOf(event: MarketEvent): string | undefined {
  if (event.id.startsWith("fomc-")) return "fomc";
  if (event.id.startsWith("ecb-")) return "ecb";
  if (event.id.startsWith("boj-")) return "boj";
  if (event.id.startsWith("lunar-new-")) return "lunar-new";
  if (event.id.startsWith("lunar-full-")) return "lunar-full";
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
  if (kind === "lunar-new" || kind === "lunar-full") return lunarPastDates(kind, from, to);
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

/**
 * Attaches recent *actual* readings (v3.4) to economic-data events from FRED's
 * underlying series. Real, free data — change is measured vs the prior reading
 * (consensus isn't freely available). No-op without a FRED key.
 */
async function attachEconPrints(events: MarketEvent[]): Promise<MarketEvent[]> {
  if (!fred.isConfigured()) return events;
  const printsByKind = new Map<string, EconPrint[]>();
  for (const r of RELEASES) {
    if (!r.seriesId || !r.transform || !r.unit) continue;
    if (!events.some((e) => kindOf(e) === r.kind)) continue;
    const obs = await fred.fetchObservations(r.seriesId, 40);
    const prints = computeRecentPrints(obs, r.transform, r.unit);
    if (prints.length) printsByKind.set(r.kind, prints);
  }
  if (printsByKind.size === 0) return events;
  console.log(`[pipeline] econ prints attached for ${printsByKind.size} series`);
  return events.map((e) => {
    const prints = printsByKind.get(kindOf(e) ?? "");
    return prints ? { ...e, econPrints: prints } : e;
  });
}

/**
 * Attaches options-implied moves (v4.4) to earnings events from the ATM
 * straddle. Fetches once per ticker; degrades to nothing if the (undocumented,
 * flaky) options source is unavailable.
 */
async function attachImpliedMoves(events: MarketEvent[]): Promise<MarketEvent[]> {
  const earnings = events.filter((e) => e.category === "earnings");
  if (earnings.length === 0) return events;

  const tickerOf = (e: MarketEvent): string | undefined =>
    [...e.links].sort((a, b) => b.strength - a.strength)[0]?.asset;

  const tickers = [...new Set(earnings.map(tickerOf).filter((t): t is string => !!t))];
  const byTicker = new Map<string, Awaited<ReturnType<typeof fetchImpliedMove>>>();
  await Promise.all(
    tickers.map(async (t) => byTicker.set(t, await fetchImpliedMove(t))),
  );
  const got = [...byTicker.values()].filter(Boolean).length;
  if (got === 0) return events;
  console.log(`[pipeline] options-implied moves for ${got}/${tickers.length} tickers`);

  return events.map((e) => {
    if (e.category !== "earnings") return e;
    const im = byTicker.get(tickerOf(e) ?? "");
    return im ? { ...e, impliedMove: im } : e;
  });
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
        hitRateCiLow: l.stats.hitRateCiLow,
        hitRateCiHigh: l.stats.hitRateCiHigh,
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

/** Publish a recent daily price series per asset for the in-app chart. */
async function writeChartPrices(now: Date) {
  const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const out: Record<string, Array<{ t: number; c: number }>> = {};
  await Promise.all(
    ASSET_IDS.map(async (id) => {
      const bars = await fetchDailyCloses(id, from, now);
      if (bars.length) {
        out[id] = bars
          .slice(-250)
          .map((b) => ({ t: Math.floor(Date.parse(`${b.date}T00:00:00Z`) / 1000), c: b.close }));
      }
    }),
  );
  await writeFile(resolve(DATA_DIR, "prices.json"), JSON.stringify(out) + "\n");
  console.log(`[pipeline] wrote price series for ${Object.keys(out).length} assets`);
}

/** Publish the past year of recurring events as slim markers for the chart. */
async function writePastEvents(now: Date) {
  const window = { from: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000), to: now };
  const providers = [
    ...KEYED_PROVIDERS,
    ...COMPUTED_PROVIDERS.filter((p) => p.id !== "gdelt"), // news isn't recurring
  ];
  let evs: MarketEvent[] = [];
  for (const p of providers) {
    if (!p.isConfigured()) continue;
    try {
      evs.push(...(await p.fetchEvents(window)));
    } catch {
      /* skip provider on error */
    }
  }
  evs = attachLinks(evs);
  const markers = evs.map((e) => ({
    t: Math.floor(Date.parse(e.scheduledAt) / 1000),
    category: e.category,
    title: e.title,
    assets: e.links.map((l) => l.asset),
    scheduled: e.isScheduled,
  }));
  await writeFile(resolve(DATA_DIR, "past-events.json"), JSON.stringify(markers) + "\n");
  console.log(`[pipeline] wrote ${markers.length} past markers`);
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
  events = await attachEconPrints(events);
  events = await attachImpliedMoves(events);
  const historical = await addHistorical(events, now);
  events = historical.events;

  const digest = buildDigest(events, now);
  const calibrationLoop = await runCalibrationLoop(events, now);
  const intelligence = await buildIntelligence(events, digest, now, calibrationLoop);

  const bundle: DataBundle = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    assets: ASSET_UNIVERSE,
    events,
    digest,
    calibration: historical.calibration,
    calibrationLoop,
    intelligence,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    resolve(DATA_DIR, "events.json"),
    JSON.stringify(bundle, null, 2) + "\n",
  );
  await writeFile(resolve(DATA_DIR, "digest.md"), digestToMarkdown(digest));
  await writeChartPrices(now);
  await writePastEvents(now);

  console.log(
    `[pipeline] wrote ${events.length} events + digest → ${DATA_DIR}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
