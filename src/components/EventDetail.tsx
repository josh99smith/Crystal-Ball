import type { MarketEvent } from "../../shared/schema";
import { CATEGORY_META } from "../../shared/categories";
import { OutcomeFan, OutcomeList } from "./Outcomes";

interface Props {
  event: MarketEvent | null;
  selectedAssets: Set<string>;
  onClose: () => void;
}

/** Detail panel for a selected event (PLAN §2.1 — outcomes arrive in Phase 2). */
export function EventDetail({ event, selectedAssets, onClose }: Props) {
  if (!event) return null;
  const meta = CATEGORY_META[event.category];
  const when = new Date(event.scheduledAt);

  return (
    <aside className="detail">
      <div className="detail-head">
        <span className="detail-cat" style={{ background: meta.color }}>
          {meta.label}
        </span>
        <button className="detail-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <h2 className="detail-title">{event.title}</h2>
      <p className="detail-when">
        {when.toLocaleString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
        {event.isScheduled ? "" : " (estimated)"}
      </p>

      <div className="detail-impact">
        <span className="muted">Expected impact</span>
        <div className="impact-bar">
          <div
            className="impact-fill"
            style={{ width: `${event.expectedImpact * 100}%` }}
          />
        </div>
        <span>{Math.round(event.expectedImpact * 100)}%</span>
      </div>

      <h3 className="detail-sub">Correlated assets</h3>
      <ul className="detail-links">
        {[...event.links]
          .sort((a, b) => b.strength - a.strength)
          .map((l) => (
            <li
              key={l.asset}
              className={selectedAssets.has(l.asset) ? "detail-link hit" : "detail-link"}
            >
              <span className="dl-asset">{l.asset}</span>
              <span className={`dl-tier tier-${l.tier}`}>{l.tier}</span>
              <div className="dl-bar">
                <div className="dl-fill" style={{ width: `${l.strength * 100}%` }} />
              </div>
              <span className="dl-strength">{l.strength.toFixed(2)}</span>
            </li>
          ))}
      </ul>

      {event.outcomes && event.outcomes.length > 0 ? (
        <>
          <h3 className="detail-sub">Weighted outcomes</h3>
          <OutcomeFan outcomes={event.outcomes} selected={selectedAssets} />
          <OutcomeList outcomes={event.outcomes} selected={selectedAssets} />
        </>
      ) : (
        <p className="muted detail-note">No scenarios available for this event.</p>
      )}
    </aside>
  );
}
