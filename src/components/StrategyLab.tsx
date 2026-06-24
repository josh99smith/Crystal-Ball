import { useMemo, useState } from "react";
import type { Asset, MarketEvent } from "../../shared/schema";
import type { PastMarker } from "../usePastEvents";
import {
  eventReturns,
  backtestStats,
  expectedMovePct,
  type BacktestReturn,
} from "../strategy";

interface Props {
  assets: Asset[];
  prices: Record<string, Array<{ t: number; c: number }>> | null;
  pastMarkers: PastMarker[];
  events: MarketEvent[]; // upcoming
  defaultAsset: string;
}

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

/**
 * Strategy lab (PLAN-V3 §2.4): backtest "act around event type X on asset A"
 * over the published price history, plus a forward expected-value read from the
 * next matching event's weighted outcomes. All client-side.
 */
export function StrategyLab({ assets, prices, pastMarkers, events, defaultAsset }: Props) {
  const [asset, setAsset] = useState(defaultAsset);
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [horizon, setHorizon] = useState<1 | 3>(1);

  // Event types (titles) with past occurrences touching this asset.
  const types = useMemo(() => {
    const s = new Set<string>();
    for (const m of pastMarkers) if (m.assets.includes(asset)) s.add(m.title);
    return [...s].sort();
  }, [pastMarkers, asset]);

  const [type, setType] = useState<string>(types[0] ?? "");
  const activeType = types.includes(type) ? type : types[0] ?? "";

  const series = prices?.[asset] ?? [];

  const returns: BacktestReturn[] = useMemo(() => {
    if (!activeType || series.length === 0) return [];
    const times = pastMarkers
      .filter((m) => m.title === activeType && m.assets.includes(asset))
      .map((m) => m.t);
    return eventReturns(times, series, horizon);
  }, [activeType, asset, series, pastMarkers, horizon]);

  const stats = useMemo(() => backtestStats(returns, direction), [returns, direction]);

  // Forward EV from the next matching upcoming event.
  const nextEvent = useMemo(
    () =>
      [...events]
        .filter((e) => e.title === activeType && e.links.some((l) => l.asset === asset))
        .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0],
    [events, activeType, asset],
  );
  const ev = nextEvent ? expectedMovePct(nextEvent, asset) : null;

  return (
    <div className="lab">
      <p className="field-hint">
        Backtest how {asset} behaved around an event type over the published price
        history (~1 year), then see the forward expected move from the next one's
        weighted outcomes. Educational — not financial advice.
      </p>

      <div className="lab-controls">
        <label>
          Asset
          <select value={asset} onChange={(e) => setAsset(e.target.value)}>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.id}</option>
            ))}
          </select>
        </label>
        <label>
          Event type
          <select value={activeType} onChange={(e) => setType(e.target.value)}>
            {types.length === 0 && <option value="">(none)</option>}
            {types.map((tp) => (
              <option key={tp} value={tp}>{tp}</option>
            ))}
          </select>
        </label>
        <label>
          Position
          <select value={direction} onChange={(e) => setDirection(e.target.value as "long" | "short")}>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </label>
        <label>
          Horizon
          <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value) as 1 | 3)}>
            <option value={1}>1 day</option>
            <option value={3}>3 days</option>
          </select>
        </label>
      </div>

      {series.length === 0 ? (
        <p className="muted empty">No price history for {asset} yet — try another asset.</p>
      ) : stats.n === 0 ? (
        <p className="muted empty">
          No past occurrences of "{activeType}" for {asset} within the available price window.
        </p>
      ) : (
        <>
          <div className="lab-stats">
            <Stat label="Occurrences" value={String(stats.n)} hint="within ~1y of prices" />
            <Stat label="Win rate" value={`${Math.round(stats.winRate * 100)}%`} hint={`${direction} made money`} good={stats.winRate >= 0.5} />
            <Stat label="Avg return" value={pct(stats.avgPct)} good={stats.avgPct >= 0} />
            <Stat label="Median" value={pct(stats.medianPct)} good={stats.medianPct >= 0} />
            <Stat label="Best / worst" value={`${pct(stats.best)} / ${pct(stats.worst)}`} />
            <Stat label="Cumulative" value={pct(stats.sumPct)} good={stats.sumPct >= 0} hint="if traded each time" />
          </div>
          {stats.n < 8 && (
            <p className="field-hint">⚠ Small sample ({stats.n}) — treat as indicative only.</p>
          )}
          <details className="lab-detail">
            <summary>Each occurrence ({returns.length})</summary>
            <ul className="lab-occurrences">
              {[...returns].reverse().map((r) => (
                <li key={r.date}>
                  <span>{r.date}</span>
                  <span className={(direction === "short" ? -r.retPct : r.retPct) >= 0 ? "up" : "down"}>
                    {pct(direction === "short" ? -r.retPct : r.retPct)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      {ev && nextEvent && (
        <div className="lab-ev">
          <h4>Forward expected move — next {activeType}</h4>
          <p className="field-hint">
            {new Date(nextEvent.scheduledAt).toLocaleDateString()} · from the event's
            weighted outcomes (magnitude proxied from impact size).
          </p>
          <div className="lab-ev-value">
            Expected move for {asset}:{" "}
            <strong className={ev.evPct >= 0 ? "up" : "down"}>{pct(ev.evPct)}</strong>
          </div>
          <ul className="lab-ev-rows">
            {ev.rows.map((r) => (
              <li key={r.label}>
                <span>{Math.round(r.weight * 100)}% {r.label}</span>
                <span className={r.contributionPct >= 0 ? "up" : "down"}>{pct(r.contributionPct)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint, good }: { label: string; value: string; hint?: string; good?: boolean }) {
  return (
    <div className="lab-stat">
      <span className="lab-stat-label">{label}</span>
      <span className={"lab-stat-value" + (good === true ? " up" : good === false ? " down" : "")}>
        {value}
      </span>
      {hint && <span className="lab-stat-hint">{hint}</span>}
    </div>
  );
}
