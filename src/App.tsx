import { useEffect, useMemo, useState } from "react";
import {
  TIMELINE_SCALES,
  type MarketEvent,
  type TimelineScaleId,
} from "../shared/schema";
import { useDataBundle } from "./useDataBundle";
import { useChartPrices } from "./useChartPrices";
import { usePastEvents } from "./usePastEvents";
import { useTheme } from "./useTheme";
import { readUrlState, writeUrlState } from "./urlState";
import { AssetSelector } from "./components/AssetSelector";
import { Timeline } from "./components/Timeline";
import { EventDetail } from "./components/EventDetail";
import { DigestView } from "./components/DigestView";
import { BriefView } from "./components/BriefView";
import { ReliabilityView } from "./components/ReliabilityView";
import { AssetChart } from "./components/AssetChart";
import { StrategyLab } from "./components/StrategyLab";
import { AskView } from "./components/AskView";
import { CryptoTicker } from "./components/CryptoTicker";

type View = "timeline" | "brief" | "ask" | "digest" | "reliability" | "chart" | "lab";
const VIEWS: View[] = ["timeline", "brief", "ask", "digest", "reliability", "chart", "lab"];
const SCALE_IDS = TIMELINE_SCALES.map((s) => s.id);

const initial = readUrlState();

function initialAssets(): Set<string> {
  if (initial.assets?.length) return new Set(initial.assets);
  try {
    const s = localStorage.getItem("cb-assets");
    if (s) return new Set(JSON.parse(s) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

export function App() {
  const state = useDataBundle();
  const prices = useChartPrices();
  const pastEvents = usePastEvents();
  const { theme, toggle: toggleTheme } = useTheme();
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(initialAssets);
  const [scale, setScale] = useState<TimelineScaleId>(
    (SCALE_IDS as string[]).includes(initial.scale ?? "")
      ? (initial.scale as TimelineScaleId)
      : "monthly",
  );
  const [view, setView] = useState<View>(
    VIEWS.includes(initial.view as View) ? (initial.view as View) : "timeline",
  );
  const [selectedEvent, setSelectedEvent] = useState<MarketEvent | null>(null);
  const [chartAsset, setChartAsset] = useState<string>(initial.chart ?? "SPX");

  // Persist watchlist (localStorage) + shareable state (URL hash).
  useEffect(() => {
    try {
      localStorage.setItem("cb-assets", JSON.stringify([...selectedAssets]));
    } catch {
      /* ignore */
    }
  }, [selectedAssets]);
  useEffect(() => {
    writeUrlState({ view, scale, assets: [...selectedAssets], chart: chartAsset });
  }, [view, scale, selectedAssets, chartAsset]);

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

  // The interactive timeline owns its time window (zoom/pan); we only filter by
  // asset relevance here.
  const assetFiltered = bundle.events.filter((e) => relevant(e, selectedAssets));
  const eventsById = new Map(bundle.events.map((e) => [e.id, e]));

  return (
    <Shell
      ticker={<CryptoTicker />}
      theme={theme}
      onToggleTheme={toggleTheme}
    >
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
              aria-selected={view === "brief"}
              className={view === "brief" ? "vt active" : "vt"}
              onClick={() => setView("brief")}
            >
              Brief
            </button>
            <button
              role="tab"
              aria-selected={view === "ask"}
              className={view === "ask" ? "vt active" : "vt"}
              onClick={() => setView("ask")}
            >
              Ask
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
            <button
              role="tab"
              aria-selected={view === "chart"}
              className={view === "chart" ? "vt active" : "vt"}
              onClick={() => setView("chart")}
            >
              Chart
            </button>
            <button
              role="tab"
              aria-selected={view === "lab"}
              className={view === "lab" ? "vt active" : "vt"}
              onClick={() => setView("lab")}
            >
              Lab
            </button>
          </div>

          {view === "chart" && (
            <select
              className="chart-asset-select"
              value={chartAsset}
              onChange={(e) => setChartAsset(e.target.value)}
              aria-label="Chart asset"
            >
              {bundle.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} — {a.label}
                </option>
              ))}
            </select>
          )}

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
              events={assetFiltered}
              scale={scale}
              horizonDays={scaleDays}
              selectedAssets={selectedAssets}
              selectedEventId={selectedEvent?.id ?? null}
              onSelect={setSelectedEvent}
            />
          )}
          {view === "brief" && (
            <BriefView
              intelligence={bundle.intelligence}
              digest={bundle.digest}
              eventsById={eventsById}
              onSelect={(e) => {
                setSelectedEvent(e);
                setView("timeline");
              }}
            />
          )}
          {view === "ask" && <AskView bundle={bundle} />}
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
            <ReliabilityView
              rows={bundle.calibration}
              loop={bundle.calibrationLoop}
              selected={selectedAssets}
            />
          )}
          {view === "chart" && (
            <AssetChart
              asset={chartAsset}
              series={prices?.[chartAsset] ?? []}
              events={bundle.events.filter((e) =>
                e.links.some((l) => l.asset === chartAsset),
              )}
              pastMarkers={pastEvents}
              onSelect={setSelectedEvent}
              theme={theme}
            />
          )}
          {view === "lab" && (
            <StrategyLab
              assets={bundle.assets}
              prices={prices}
              pastMarkers={pastEvents}
              events={bundle.events}
              defaultAsset={chartAsset}
            />
          )}
        </div>

        <EventDetail
          event={selectedEvent}
          selectedAssets={selectedAssets}
          narrative={selectedEvent ? bundle.intelligence?.narratives[selectedEvent.id] : undefined}
          onClose={() => setSelectedEvent(null)}
        />
      </div>

      <footer className="meta">
        <div>
          Data generated {new Date(bundle.generatedAt).toLocaleString()} ·{" "}
          {view === "timeline" ? `${assetFiltered.length} events tracked · ` : ""}
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
  theme,
  onToggleTheme,
}: {
  children: React.ReactNode;
  ticker?: React.ReactNode;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
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
        <div className="masthead-right">
          {ticker}
          {onToggleTheme && (
            <button
              className="theme-toggle"
              onClick={onToggleTheme}
              aria-label="Toggle light/dark theme"
              title="Toggle light/dark theme"
            >
              {theme === "light" ? "🌙" : "☀️"}
            </button>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
