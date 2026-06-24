import { useMemo, useState } from "react";
import {
  TIMELINE_SCALES,
  type MarketEvent,
  type TimelineScaleId,
} from "../shared/schema";
import { useDataBundle } from "./useDataBundle";
import { AssetSelector } from "./components/AssetSelector";
import { Timeline } from "./components/Timeline";

export function App() {
  const state = useDataBundle();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scale, setScale] = useState<TimelineScaleId>("monthly");

  const scaleDays = useMemo(
    () => TIMELINE_SCALES.find((s) => s.id === scale)!.days,
    [scale],
  );

  if (state.status === "loading") {
    return <Shell>Loading forecasts…</Shell>;
  }
  if (state.status === "error") {
    return (
      <Shell>
        <p className="error">Could not load data: {state.error}</p>
        <p className="muted">
          Run <code>npm run pipeline</code> to generate{" "}
          <code>public/data/events.json</code>.
        </p>
      </Shell>
    );
  }

  const { bundle } = state;
  const now = Date.now();
  const horizon = now + scaleDays * 24 * 60 * 60 * 1000;

  const visible = bundle.events
    .filter((e) => {
      const t = Date.parse(e.scheduledAt);
      return t >= now && t <= horizon;
    })
    .filter((e) => relevant(e, selected));

  return (
    <Shell>
      <div className="controls">
        <AssetSelector
          assets={bundle.assets}
          selected={selected}
          onToggle={(id) =>
            setSelected((prev) => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            })
          }
          onClear={() => setSelected(new Set())}
        />
        <div className="scales" role="tablist" aria-label="Timeline scale">
          {TIMELINE_SCALES.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={scale === s.id}
              className={scale === s.id ? "scale active" : "scale"}
              onClick={() => setScale(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Timeline events={visible} selected={selected} />

      <footer className="meta">
        Data generated {new Date(bundle.generatedAt).toLocaleString()} ·{" "}
        {visible.length} events shown · Not financial advice.
      </footer>
    </Shell>
  );
}

/** An event is relevant if nothing is selected, or it links to a selected asset. */
function relevant(event: MarketEvent, selected: Set<string>): boolean {
  if (selected.size === 0) return true;
  return event.links.some((l) => selected.has(l.asset));
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <header className="masthead">
        <h1>🔮 Crystal-Ball</h1>
        <p className="tagline">
          Market-moving events ahead — weighted outcomes &amp; asset correlation.
        </p>
      </header>
      {children}
    </div>
  );
}
