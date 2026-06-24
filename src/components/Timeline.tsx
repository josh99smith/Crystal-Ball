import type { MarketEvent } from "../../shared/schema";

interface Props {
  events: MarketEvent[];
  selected: Set<string>;
}

/**
 * Phase 0/1 timeline: a chronological list of upcoming events with impact and
 * asset-link badges. The richer zoomable axis with weighted outcome fans
 * (PLAN §2.1) arrives in later phases.
 */
export function Timeline({ events, selected }: Props) {
  if (events.length === 0) {
    return <p className="muted empty">No events in this window for the current filter.</p>;
  }

  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.id} className="event">
          <div className="event-date">
            <time dateTime={e.scheduledAt}>
              {new Date(e.scheduledAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </time>
          </div>
          <div className="event-body">
            <div className="event-title-row">
              <span className="event-title">{e.title}</span>
              <span className={`impact impact-${impactBand(e.expectedImpact)}`}>
                {impactBand(e.expectedImpact)} impact
              </span>
            </div>
            <div className="event-links">
              {[...e.links]
                .sort((a, b) => b.strength - a.strength)
                .map((l) => (
                  <span
                    key={l.asset}
                    className={
                      selected.has(l.asset) ? "link-badge hit" : "link-badge"
                    }
                    title={`${l.tier} link · strength ${l.strength.toFixed(2)}`}
                  >
                    {l.asset}
                    <i className="link-strength" style={{ opacity: l.strength }} />
                  </span>
                ))}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function impactBand(v: number): "low" | "med" | "high" {
  if (v >= 0.8) return "high";
  if (v >= 0.5) return "med";
  return "low";
}
