import { useMemo } from "react";
import type { MarketEvent, TimelineScaleId } from "../../shared/schema";
import { CATEGORY_META } from "../../shared/categories";
import { axisTicks, layoutEvents } from "../timelineLayout";

interface Props {
  events: MarketEvent[];
  scale: TimelineScaleId;
  horizonDays: number;
  selectedAssets: Set<string>;
  selectedEventId: string | null;
  onSelect: (event: MarketEvent) => void;
}

const LANE_HEIGHT = 46;

/**
 * Horizontal, zoomable timeline (PLAN §2.1/§2.4). Events are positioned by date
 * across the window, sized by impact, colored by category, and stacked into
 * lanes to avoid overlap. Clicking a node opens the detail panel.
 */
export function Timeline({
  events,
  scale,
  horizonDays,
  selectedAssets,
  selectedEventId,
  onSelect,
}: Props) {
  const { now, horizon } = useMemo(() => {
    const n = new Date();
    return {
      now: n,
      horizon: new Date(n.getTime() + horizonDays * 24 * 60 * 60 * 1000),
    };
  }, [horizonDays]);

  const ticks = useMemo(() => axisTicks(now, horizon, scale), [now, horizon, scale]);
  const { positioned, laneCount } = useMemo(
    () => layoutEvents(events, now, horizon),
    [events, now, horizon],
  );

  if (events.length === 0) {
    return (
      <p className="muted empty">No events in this window for the current filter.</p>
    );
  }

  const height = laneCount * LANE_HEIGHT + 28;

  return (
    <div className="timeline-wrap">
      <div className="timeline-axis" style={{ height }}>
        {/* gridlines + tick labels */}
        {ticks.map((t, i) => (
          <div key={i} className="tick" style={{ left: `${t.pct}%` }}>
            <span className="tick-label">{t.label}</span>
          </div>
        ))}
        {/* "now" marker */}
        <div className="now-marker" style={{ left: 0 }}>
          <span className="now-label">now</span>
        </div>

        {/* event nodes */}
        {positioned.map(({ event, pct, lane }) => {
          const meta = CATEGORY_META[event.category];
          const hit =
            selectedAssets.size > 0 &&
            event.links.some((l) => selectedAssets.has(l.asset));
          const size = 12 + event.expectedImpact * 12;
          return (
            <button
              key={event.id}
              className={
                "node" +
                (selectedEventId === event.id ? " selected" : "") +
                (hit ? " hit" : "")
              }
              style={{
                left: `${pct}%`,
                top: lane * LANE_HEIGHT + 18,
                ["--node-color" as string]: meta.color,
                width: size,
                height: size,
              }}
              title={`${event.title} · ${meta.label}`}
              onClick={() => onSelect(event)}
            >
              <span className="node-label">{event.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
