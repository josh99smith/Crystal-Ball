import { useMemo, useState } from "react";
import {
  TIMELINE_SCALES,
  type MarketEvent,
  type TimelineScaleId,
} from "../shared/schema";
import { useDataBundle } from "./useDataBundle";
import { AssetSelector } from "./components/AssetSelector";
import { Timeline } from "./components/Timeline";
import { EventDetail } from "./components/EventDetail";
import { DigestView } from "./components/DigestView";
import { ReliabilityView } from "./components/ReliabilityView";
import { CryptoTicker } from "./components/CryptoTicker";

type View = "timeline" | "digest" | "reliability";

export function App() {
  const state = useDataBundle();
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [scale, setScale] = useState<TimelineScaleId>("monthly");
  const [view, setView] = useState<View>("timeline");
  const [selectedEvent, setSelectedEvent] = useState<MarketEvent | null>(null);

  const scaleDays = useMemo(
    () => TIMELINE_SCALES.find((s) => s.id === scale)!.days,
    [scale],
  );

  if (state.status === "loading") return <Shell>Loading forecasts…</Shell>;
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
    .filter((e) => relevant(e, selectedAssets));

  const eventsById = new Map(bundle.events.map((e) => [e.id, e]));

  return (
    <Shell ticker={<CryptoTicker />}>
      <div className="controls">
        <AssetSelector
          assets={bundle.assets}
          selected={selectedAssets}
          onToggle={(id) =>
            setSelectedAssets((prev) => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            })
          }
          onClear={() => setSelectedAssets(new Set())}
        />

        <div className="toolbar">
          <div className="view-toggle" role="tablist" aria-label="View">
            <button
              role="tab"
              aria-selected={view === "timeline"}
              className={view === "timeline" ? "vt active" : "vt"}
              onClick={() => setView("timeline")}
            >
              Timeline
            </button>
            <button
              role="tab"
              aria-selected={view === "digest"}
              className={view === "digest" ? "vt active" : "vt"}
              onClick={() => setView("digest")}
            >
              Digest
            </button>
            <button
              role="tab"
              aria-selected={view === "reliability"}
              className={view === "reliability" ? "vt active" : "vt"}
              onClick={() => setView("reliability")}
            >
              Reliability
            </button>
          </div>

          {view === "timeline" && (
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
          )}
        </div>
      </div>

      <div className="stage">
        <div className="stage-main">
          {view === "timeline" && (
            <Timeline
              events={visible}
              scale={scale}
              horizonDays={scaleDays}
              selectedAssets={selectedAssets}
              selectedEventId={selectedEvent?.id ?? null}
              onSelect={setSelectedEvent}
            />
          )}
          {view === "digest" && (
            <DigestView
              digest={bundle.digest}
              eventsById={eventsById}
              onSelect={(e) => {
                setSelectedEvent(e);
                setView("timeline");
              }}
            />
          )}
          {view === "reliability" && (
            <ReliabilityView rows={bundle.calibration} selected={selectedAssets} />
          )}
        </div>

        <EventDetail
          event={selectedEvent}
          selectedAssets={selectedAssets}
          onClose={() => setSelectedEvent(null)}
        />
      </div>

      <footer className="meta">
        <div>
          Data generated {new Date(bundle.generatedAt).toLocaleString()} ·{" "}
          {view === "timeline" ? `${visible.length} events shown · ` : ""}
          Not financial advice.
        </div>
        <div className="build-stamp">
          Build #{__BUILD_NUMBER__} ({__BUILD_SHA__}) · built{" "}
          {new Date(__BUILD_TIME__).toLocaleString()}
        </div>
      </footer>
    </Shell>
  );
}

/** An event is relevant if nothing is selected, or it links to a selected asset. */
function relevant(event: MarketEvent, selected: Set<string>): boolean {
  if (selected.size === 0) return true;
  return event.links.some((l) => selected.has(l.asset));
}

function Shell({
  children,
  ticker,
}: {
  children: React.ReactNode;
  ticker?: React.ReactNode;
}) {
  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1>🔮 Crystal-Ball</h1>
          <p className="tagline">
            Market-moving events ahead — weighted outcomes &amp; asset correlation.
          </p>
        </div>
        {ticker}
      </header>
      {children}
    </div>
  );
}
