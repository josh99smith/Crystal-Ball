import { useMemo, useRef, useState } from "react";
import type { DataBundle } from "../../shared/schema";
import { useApiKey } from "../useApiKey";
import {
  ASK_MODELS,
  askClaude,
  buildContext,
  buildSystemPrompt,
  type ChatTurn,
} from "../ask/anthropic";

interface Props {
  bundle: DataBundle;
}

const SUGGESTIONS = [
  "What moves gold next month?",
  "What are the biggest risks for the S&P 500 this week?",
  "Which upcoming event is most market-moving, and why?",
  "How has the Nasdaq historically reacted to CPI?",
];

/**
 * Ask-the-Ball (v3.6) — natural-language Q&A grounded in the published bundle,
 * using the user's own Anthropic API key (fully static, no backend).
 */
export function AskView({ bundle }: Props) {
  const { apiKey, setKey, clearKey, model, setModel } = useApiKey();
  const [keyInput, setKeyInput] = useState("");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const system = useMemo(() => buildSystemPrompt(buildContext(bundle)), [bundle]);

  async function ask(q: string) {
    const query = q.trim();
    if (!query || busy || !apiKey) return;
    setError(null);
    setBusy(true);
    const history = turns;
    setTurns((t) => [...t, { role: "user", content: query }]);
    setQuestion("");
    try {
      const { text } = await askClaude({ apiKey, model, system, history, question: query });
      setTurns((t) => [...t, { role: "assistant", content: text }]);
    } catch (e) {
      setError((e as Error).message);
      // drop the optimistic user turn's pairing failure context but keep the question visible
    } finally {
      setBusy(false);
      requestAnimationFrame(() => {
        scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
      });
    }
  }

  if (!apiKey) {
    return (
      <div className="ask">
        <h3 className="detail-sub">Ask the Ball</h3>
        <p className="field-hint">
          Ask natural-language questions about the upcoming events and asset
          correlations on this site. This is fully static — there is no backend,
          so you bring your own <b>Anthropic API key</b>. The key is stored only
          in this browser (localStorage) and is sent only to{" "}
          <code>api.anthropic.com</code>. Not financial advice.
        </p>
        <div className="ask-key-setup">
          <input
            type="password"
            placeholder="sk-ant-…"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            aria-label="Anthropic API key"
            autoComplete="off"
          />
          <button className="ask-send" disabled={!keyInput.trim()} onClick={() => setKey(keyInput.trim())}>
            Save key
          </button>
        </div>
        <p className="field-hint">
          Get a key at{" "}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
            console.anthropic.com
          </a>
          . You are billed by Anthropic for your own usage.
        </p>
      </div>
    );
  }

  return (
    <div className="ask">
      <div className="ask-toolbar">
        <label className="ask-model">
          Model
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {ASK_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
        <button className="ask-clearkey" onClick={clearKey} title="Remove the stored API key from this browser">
          Clear key
        </button>
      </div>

      <div className="ask-thread" ref={scroller}>
        {turns.length === 0 && (
          <div className="ask-suggestions">
            <p className="field-hint">Try asking:</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="ask-chip" onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "ask-turn user" : "ask-turn assistant"}>
            <span className="ask-role">{t.role === "user" ? "You" : "🔮"}</span>
            <div className="ask-bubble">{t.content}</div>
          </div>
        ))}
        {busy && <div className="ask-turn assistant"><span className="ask-role">🔮</span><div className="ask-bubble muted">Thinking…</div></div>}
      </div>

      {error && <p className="error ask-error">{error}</p>}

      <form
        className="ask-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about an event, asset, or correlation…"
          aria-label="Your question"
          disabled={busy}
        />
        <button className="ask-send" type="submit" disabled={busy || !question.trim()}>
          Ask
        </button>
      </form>
      <p className="field-hint">
        Answers are generated from this site's data by Claude ({model}). Calibrated
        scenarios &amp; historical correlations — <b>not financial advice</b>.
      </p>
    </div>
  );
}
