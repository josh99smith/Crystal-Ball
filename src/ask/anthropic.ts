import type { DataBundle, MarketEvent } from "../../shared/schema";

// Ask-the-Ball (PLAN-V3 §2.1 / §4, option A: bring-your-own-key, fully static).
// The browser calls Claude directly with the user's own Anthropic API key —
// no backend, no proxy. The key lives only in localStorage and is sent only to
// api.anthropic.com. Answers are grounded in the published data bundle.

export interface AskModel {
  id: string;
  label: string;
}

// Default to the most capable model; cheaper options are user-selectable since
// the user pays for their own usage.
export const ASK_MODELS: AskModel[] = [
  { id: "claude-opus-4-8", label: "Opus 4.8 — most capable" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — balanced" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — fastest / cheapest" },
];
export const DEFAULT_ASK_MODEL = ASK_MODELS[0].id;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

/** One compact line per event: date, title, impact, top assets, lead outcome. */
function eventLine(e: MarketEvent): string {
  const top = [...e.links]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4)
    .map((l) => l.asset)
    .join(", ");
  const lead = (e.outcomes ?? [])
    .slice()
    .sort((a, b) => b.weight - a.weight)[0];
  const outcome = lead ? ` | most-likely: ${lead.label} (${Math.round(lead.weight * 100)}%)` : "";
  const prints = e.econPrints?.length
    ? ` | latest actual: ${e.econPrints[0].value > 0 ? "+" : ""}${e.econPrints[0].value} ${e.econPrints[0].unit}`
    : "";
  return `- ${fmtDate(e.scheduledAt)} · ${e.title} (${e.category}, impact ${Math.round(
    e.expectedImpact * 100,
  )}%) | assets: ${top || "—"}${outcome}${prints}`;
}

/**
 * Build a compact, bounded grounding context from the bundle. Pure & testable.
 * Caps the event list so the prompt stays small regardless of bundle size.
 */
export function buildContext(bundle: DataBundle, maxEvents = 25): string {
  const now = Date.now();
  const upcoming = bundle.events
    .filter((e) => Date.parse(e.scheduledAt) >= now - 86400_000)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
    .slice(0, maxEvents);

  const cal = (bundle.calibration ?? [])
    .slice()
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 12)
    .map(
      (r) =>
        `- ${r.kindLabel} → ${r.asset}: same-direction ${Math.round(
          r.directionHitRate * 100,
        )}% over n=${r.n}, avg move ±${r.avgAbsMovePct}% (strength ${r.strength.toFixed(2)})`,
    )
    .join("\n");

  const assets = bundle.assets.map((a) => `${a.id} (${a.label})`).join(", ");

  return [
    `Data generated: ${fmtDate(bundle.generatedAt)}.`,
    bundle.digest?.headline ? `Digest headline: ${bundle.digest.headline}` : "",
    bundle.intelligence?.brief ? `\nWeek-ahead brief:\n${bundle.intelligence.brief}` : "",
    `\nTracked assets: ${assets}`,
    `\nUpcoming events (${upcoming.length}):\n${upcoming.map(eventLine).join("\n")}`,
    cal ? `\nStrongest measured event→asset reactions (event study):\n${cal}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** System prompt: persona + grounding + guardrails. Pure & testable. */
export function buildSystemPrompt(context: string): string {
  return [
    "You are Crystal-Ball, an assistant that answers questions about upcoming market-moving events and their likely effects on assets.",
    "Answer ONLY from the DATA below. If the data doesn't cover the question, say so plainly rather than guessing or using outside knowledge.",
    "Be concise and specific: cite event names, dates, weighted-outcome probabilities, and measured hit rates from the data. Prefer a few sentences or a short list.",
    "These are calibrated scenarios and historical correlations, not predictions. Always make clear this is NOT financial advice.",
    "\n=== DATA ===\n" + context,
  ].join("\n");
}

export interface AskResult {
  text: string;
  refused: boolean;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  error?: { message?: string };
}

/**
 * Call Claude directly from the browser with the user's key (option A).
 * Throws Error with a readable message on HTTP/credential failures.
 */
export async function askClaude(opts: {
  apiKey: string;
  model: string;
  system: string;
  history: ChatTurn[];
  question: string;
}): Promise<AskResult> {
  const messages = [
    ...opts.history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: opts.question },
  ];

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
        // Required for keyless/browser-origin calls (CORS opt-in).
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 1024,
        system: opts.system,
        messages,
      }),
    });
  } catch (err) {
    throw new Error(`Network error calling Anthropic: ${(err as Error).message}`);
  }

  let body: AnthropicResponse | null = null;
  try {
    body = (await res.json()) as AnthropicResponse;
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401) throw new Error("Invalid API key (401). Check the key and try again.");
    if (res.status === 429) throw new Error("Rate limited (429). Wait a moment and retry.");
    throw new Error(msg);
  }

  if (body?.stop_reason === "refusal") {
    return { text: "I can't help with that request.", refused: true };
  }

  const text = (body?.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n")
    .trim();

  return { text: text || "(no answer returned)", refused: false };
}
