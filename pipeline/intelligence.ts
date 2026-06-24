import Anthropic from "@anthropic-ai/sdk";
import type {
  CalibrationMetrics,
  Digest,
  Intelligence,
  MarketEvent,
} from "../shared/schema";

/**
 * Intelligence layer (PLAN-V3 §2.1) — a narrative brief, per-event "what to
 * watch" lines, and deterministic anomaly callouts. Uses Claude when configured
 * (ANTHROPIC_API_KEY) and falls back to a templated brief otherwise, so it's
 * always populated and clearly labeled by `generatedBy`.
 */

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";
const DAY = 24 * 60 * 60 * 1000;

function configured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** Deterministic structural callouts (no AI needed). */
function detectAnomalies(
  events: MarketEvent[],
  now: Date,
  loop?: CalibrationMetrics,
): string[] {
  const out: string[] = [];
  const soon = events.filter((e) => {
    const t = Date.parse(e.scheduledAt);
    return t >= now.getTime() && t <= now.getTime() + 7 * DAY;
  });
  const highSoon = soon.filter((e) => e.expectedImpact >= 0.8);
  if (highSoon.length >= 3) {
    out.push(`Heavy week: ${highSoon.length} high-impact events in the next 7 days.`);
  }

  // Days where 3+ events stack (with at least one high-impact).
  const byDay = new Map<string, MarketEvent[]>();
  for (const e of events) {
    const t = Date.parse(e.scheduledAt);
    if (t < now.getTime() || t > now.getTime() + 30 * DAY) continue;
    const d = e.scheduledAt.slice(0, 10);
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(e);
  }
  for (const [d, evs] of [...byDay.entries()].sort()) {
    if (evs.length >= 3 && evs.some((e) => e.expectedImpact >= 0.7)) {
      out.push(`${evs.length} events stack on ${fmtDate(`${d}T12:00:00Z`)} — elevated single-day risk.`);
      break;
    }
  }

  // Calibration drift.
  const drift = (loop?.bands ?? []).find(
    (b) => b.n >= 5 && Math.abs(b.hitRate - b.avgConfidence) >= 0.15,
  );
  if (drift) {
    const dir = drift.hitRate < drift.avgConfidence ? "over-confident" : "under-confident";
    out.push(
      `Calibration: the ${Math.round(drift.avgConfidence * 100)}% band is realizing ` +
        `${Math.round(drift.hitRate * 100)}% — the model looks ${dir} there.`,
    );
  }
  return out.slice(0, 4);
}

/** Top upcoming scheduled events worth a narrative. */
function topEvents(events: MarketEvent[], now: Date, max = 8): MarketEvent[] {
  return events
    .filter((e) => {
      const t = Date.parse(e.scheduledAt);
      return e.isScheduled && t >= now.getTime() && t <= now.getTime() + 45 * DAY;
    })
    .sort(
      (a, b) =>
        b.expectedImpact - a.expectedImpact ||
        Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
    )
    .slice(0, max);
}

function topAssets(e: MarketEvent): string[] {
  return [...e.links].sort((a, b) => b.strength - a.strength).slice(0, 3).map((l) => l.asset);
}

// --- Heuristic fallback -------------------------------------------------------

function heuristicNarrative(e: MarketEvent): string {
  const assets = topAssets(e).join(", ") || "linked assets";
  const top = [...(e.outcomes ?? [])].sort((a, b) => b.weight - a.weight)[0];
  const base = top ? ` Base case: "${top.label}" (~${Math.round(top.weight * 100)}%).` : "";
  return `Watch ${assets}.${base}`;
}

function heuristicBrief(digest: Digest, anomalies: string[]): string {
  const parts: string[] = [digest.headline];
  if (digest.daily.length) {
    parts.push(
      "Key events in the next 7 days: " +
        digest.daily.slice(0, 5).map((i) => `${i.title} (${fmtDate(i.scheduledAt)})`).join("; ") +
        ".",
    );
  }
  if (anomalies.length) parts.push(anomalies.join(" "));
  parts.push("Generated automatically (no AI). Not financial advice.");
  return parts.join("\n\n");
}

// --- Claude -------------------------------------------------------------------

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

async function claudeBrief(digest: Digest, anomalies: string[]): Promise<string> {
  const items = digest.weekly
    .map((i) => `- ${fmtDate(i.scheduledAt)}: ${i.title} (impact ${i.expectedImpact.toFixed(2)}, touches ${i.topAssets.join("/") || "n/a"})`)
    .join("\n");
  const prompt = [
    "You are writing a concise, neutral 'week/month ahead' brief for a market-events dashboard.",
    "Use ONLY the data below. 2-3 short paragraphs. No buy/sell advice; describe what to watch and why.",
    "",
    `Headline: ${digest.headline}`,
    `Upcoming events:\n${items || "(none)"}`,
    anomalies.length ? `Notable: ${anomalies.join(" ")}` : "",
    "",
    "End with a one-line reminder that this is calibrated scenario analysis, not financial advice.",
  ].join("\n");

  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

const NARRATIVE_TOOL: Anthropic.Tool = {
  name: "submit_narratives",
  description: "Submit a one-line 'what to watch' note per event.",
  input_schema: {
    type: "object",
    properties: {
      narratives: {
        type: "array",
        items: {
          type: "object",
          properties: {
            eventId: { type: "string" },
            text: { type: "string", description: "<=160 chars, neutral, what to watch." },
          },
          required: ["eventId", "text"],
        },
      },
    },
    required: ["narratives"],
  },
};

async function claudeNarratives(events: MarketEvent[]): Promise<Record<string, string>> {
  const list = events
    .map((e) => `- id=${e.id} | ${e.title} | ${fmtDate(e.scheduledAt)} | impact ${e.expectedImpact.toFixed(2)} | assets ${topAssets(e).join("/")}`)
    .join("\n");
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [NARRATIVE_TOOL],
    tool_choice: { type: "tool", name: "submit_narratives" },
    messages: [
      {
        role: "user",
        content:
          "Write a neutral one-line 'what to watch' note for each event (no advice). Events:\n" +
          list,
      },
    ],
  });
  const tool = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const raw = (tool?.input as { narratives?: Array<{ eventId: string; text: string }> })?.narratives ?? [];
  const out: Record<string, string> = {};
  for (const n of raw) if (n.eventId && n.text) out[n.eventId] = n.text;
  return out;
}

export async function buildIntelligence(
  events: MarketEvent[],
  digest: Digest,
  now: Date,
  loop?: CalibrationMetrics,
): Promise<Intelligence> {
  const anomalies = detectAnomalies(events, now, loop);
  const top = topEvents(events, now);

  if (configured()) {
    try {
      const [brief, narratives] = await Promise.all([
        claudeBrief(digest, anomalies),
        claudeNarratives(top),
      ]);
      if (brief) {
        console.log("[pipeline] intelligence: Claude brief + narratives");
        return { brief, generatedBy: "claude", model: MODEL, anomalies, narratives, updatedAt: now.toISOString() };
      }
    } catch (err) {
      console.warn(`[pipeline] intelligence: Claude failed (${(err as Error).message}) — heuristic`);
    }
  }

  console.log("[pipeline] intelligence: heuristic");
  const narratives: Record<string, string> = {};
  for (const e of top) narratives[e.id] = heuristicNarrative(e);
  return {
    brief: heuristicBrief(digest, anomalies),
    generatedBy: "heuristic",
    anomalies,
    narratives,
    updatedAt: now.toISOString(),
  };
}
