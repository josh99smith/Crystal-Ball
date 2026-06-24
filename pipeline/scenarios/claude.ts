import Anthropic from "@anthropic-ai/sdk";
import type {
  AssetImpact,
  Direction,
  Magnitude,
  MarketEvent,
  Outcome,
  WeightSource,
} from "../../shared/schema";

/**
 * Claude reasoning layer for scenario weighting (PLAN §6). Produces mutually
 * exclusive outcomes with probability weights, per-asset impacts, and a one-line
 * rationale, using structured output (forced tool use) so results are validated
 * rather than parsed from prose. Runs only in the pipeline (Actions), where the
 * API key lives.
 */

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";

const DIRECTIONS: Direction[] = ["up", "down", "neutral"];
const MAGNITUDES: Magnitude[] = ["low", "med", "high"];
const WEIGHT_SOURCES: WeightSource[] = ["market-implied", "consensus", "historical", "model"];

const SCENARIO_TOOL: Anthropic.Tool = {
  name: "submit_scenarios",
  description: "Submit the weighted outcome scenarios for the event.",
  input_schema: {
    type: "object",
    properties: {
      outcomes: {
        type: "array",
        description: "2-4 mutually exclusive outcomes whose weights sum to ~1.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Short scenario name, e.g. 'Above consensus'." },
            weight: { type: "number", description: "Probability 0-1." },
            weightSource: { type: "string", enum: WEIGHT_SOURCES },
            rationale: { type: "string", description: "One line: the scenario and its market reaction." },
            assetImpacts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  asset: { type: "string", description: "One of the event's correlated asset ids." },
                  direction: { type: "string", enum: DIRECTIONS },
                  magnitude: { type: "string", enum: MAGNITUDES },
                },
                required: ["asset", "direction", "magnitude"],
              },
            },
          },
          required: ["label", "weight", "weightSource", "assetImpacts"],
        },
      },
    },
    required: ["outcomes"],
  },
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function claudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function buildPrompt(event: MarketEvent): string {
  const assets = event.links
    .sort((a, b) => b.strength - a.strength)
    .map((l) => `${l.asset} (${l.tier}, strength ${l.strength.toFixed(2)})`)
    .join(", ");
  const when = new Date(event.scheduledAt).toUTCString();

  return [
    `Event: ${event.title}`,
    `Category: ${event.category}`,
    `Scheduled: ${when}`,
    `Correlated assets: ${assets || "(none)"}`,
    ``,
    `Produce 2-4 mutually exclusive outcomes for this event with probability`,
    `weights that sum to ~1. For each outcome, give the expected directional`,
    `impact (up/down/neutral) and magnitude (low/med/high) for the correlated`,
    `assets above — only those assets. Keep a one-line rationale.`,
    ``,
    `No live market-implied data is provided, so base weights on consensus`,
    `expectations and historical base rates, and set weightSource accordingly`,
    `("consensus" or "historical"; use "market-implied" only if you genuinely`,
    `reference such data). Be calibrated and honest — do not overstate.`,
  ].join("\n");
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Generates outcomes via Claude. Throws on API/validation failure (caller falls back). */
export async function claudeOutcomes(event: MarketEvent): Promise<Outcome[]> {
  const linked = new Set(event.links.map((l) => l.asset));

  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [SCENARIO_TOOL],
    tool_choice: { type: "tool", name: "submit_scenarios" },
    messages: [{ role: "user", content: buildPrompt(event) }],
  });

  const toolUse = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) throw new Error("no tool_use in Claude response");

  const raw = (toolUse.input as { outcomes?: unknown }).outcomes;
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("no outcomes returned");

  const outcomes: Outcome[] = raw.map((o, i) => {
    const r = o as Record<string, unknown>;
    const impacts = Array.isArray(r.assetImpacts) ? r.assetImpacts : [];
    const assetImpacts: AssetImpact[] = impacts
      .map((a) => a as Record<string, unknown>)
      .filter((a) => linked.has(String(a.asset)))
      .map((a) => ({
        asset: String(a.asset),
        direction: (DIRECTIONS.includes(a.direction as Direction) ? a.direction : "neutral") as Direction,
        magnitude: (MAGNITUDES.includes(a.magnitude as Magnitude) ? a.magnitude : "med") as Magnitude,
      }));
    return {
      id: `oc-${i}`,
      label: String(r.label ?? `Scenario ${i + 1}`),
      weight: clamp01(Number(r.weight) || 0),
      weightSource: (WEIGHT_SOURCES.includes(r.weightSource as WeightSource)
        ? r.weightSource
        : "model") as WeightSource,
      assetImpacts,
      rationale: r.rationale ? String(r.rationale) : undefined,
    };
  });

  // Normalize weights to sum to 1.
  const total = outcomes.reduce((s, o) => s + o.weight, 0);
  if (total > 0) outcomes.forEach((o) => (o.weight = o.weight / total));

  return outcomes;
}
