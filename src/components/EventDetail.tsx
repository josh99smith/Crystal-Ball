import type { MarketEvent } from "../../shared/schema";
import { CATEGORY_META } from "../../shared/categories";
import { OutcomeFan, OutcomeList } from "./Outcomes";

interface Props {
  event: MarketEvent | null;
  selectedAssets: Set<string>;
  narrative?: string;
  onClose: () => void;
}

const TIER_TIP: Record<string, string> = {
  structural: "Structural: a curated, economically-obvious link.",
  historical: "Historical: measured from how the asset actually reacted to past occurrences of this event.",
};
const SIG_LABEL: Record<string, string> = {
  low: "low confidence",
  medium: "medium confidence",
  high: "high confidence",
};

/** Detail panel for a selected event, with inline explanations of each metric. */
export function EventDetail({ event, selectedAssets, narrative, onClose }: Props) {
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
        {event.isScheduled ? "" : " · estimated timing (anticipated event)"}
      </p>

      {narrative && (
        <p className="detail-narrative">
          <span className="dn-label">What to watch</span> {narrative}
        </p>
      )}

      <div className="detail-impact" title="How market-moving this type of event tends to be">
        <span className="muted">Expected impact</span>
        <div className="impact-bar">
          <div className="impact-fill" style={{ width: `${event.expectedImpact * 100}%` }} />
        </div>
        <span>{Math.round(event.expectedImpact * 100)}%</span>
      </div>
      <p className="field-hint">How market-moving this event tends to be (0–100%).</p>

      {event.econPrints && event.econPrints.length > 0 && (
        <>
          <h3 className="detail-sub">Recent actuals</h3>
          <p className="field-hint">
            The latest released figures for this series (FRED). Change is vs the{" "}
            <b>prior reading</b>, not analyst consensus (which isn't freely available).
          </p>
          <ul className="econ-prints">
            {event.econPrints.map((p) => (
              <li key={p.period}>
                <span className="ep-period">
                  {new Date(`${p.period}T00:00:00Z`).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  })}
                </span>
                <span className="ep-value">
                  {p.value > 0 ? "+" : ""}
                  {p.value} {p.unit}
                </span>
                {p.changeFromPrior != null && (
                  <span className={p.changeFromPrior >= 0 ? "ep-chg up" : "ep-chg down"}>
                    {p.changeFromPrior >= 0 ? "▲" : "▼"} {Math.abs(p.changeFromPrior)} vs prior
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="detail-sub">Correlated assets</h3>
      <p className="field-hint">
        Assets this event tends to move. Each shows up to two links — a{" "}
        <b>structural</b> (curated) and a <b>historical</b> (measured) strength, 0–1.
      </p>
      <ul className="detail-links">
        {[...event.links]
          .sort((a, b) => b.strength - a.strength)
          .map((l) => (
            <li
              key={`${l.asset}-${l.tier}`}
              className={selectedAssets.has(l.asset) ? "detail-link hit" : "detail-link"}
            >
              <div className="dl-row">
                <span className="dl-asset">{l.asset}</span>
                <span className={`dl-tier tier-${l.tier}`} title={TIER_TIP[l.tier]}>
                  {l.tier}
                </span>
                <div className="dl-bar" title={`Link strength ${l.strength.toFixed(2)} of 1`}>
                  <div className="dl-fill" style={{ width: `${l.strength * 100}%` }} />
                </div>
                <span className="dl-strength">{l.strength.toFixed(2)}</span>
              </div>
              {l.stats && (
                <div className="dl-stats">
                  <span>
                    {l.stats.n} past events · avg move ±{l.stats.avgAbsMovePct}% · moved
                    same direction{" "}
                    {Math.round(
                      (l.stats.recencyWeightedHitRate ?? l.stats.directionHitRate) * 100,
                    )}
                    % of the time
                    {l.stats.hitRateCiLow != null && l.stats.hitRateCiHigh != null && (
                      <span
                        className="dl-ci"
                        title="95% confidence interval on the hit rate — wider when fewer past occurrences were sampled"
                      >
                        {" "}(95% CI {Math.round(l.stats.hitRateCiLow * 100)}–
                        {Math.round(l.stats.hitRateCiHigh * 100)}%)
                      </span>
                    )}
                    {l.stats.significance && (
                      <span
                        className={`sig sig-${l.stats.significance}`}
                        title="Confidence based on how many past occurrences were sampled"
                      >
                        {SIG_LABEL[l.stats.significance]}
                      </span>
                    )}
                  </span>
                  {(l.stats.intradayHitRate != null || l.stats.threeDayDriftPct != null) && (
                    <span
                      className="dl-stats-windows"
                      title="Reaction at different horizons around the event"
                    >
                      {l.stats.intradayHitRate != null && (
                        <>same-day (open→close) {Math.round(l.stats.intradayHitRate * 100)}% · </>
                      )}
                      {l.stats.threeDayDriftPct != null && (
                        <>3-day drift {l.stats.threeDayDriftPct > 0 ? "+" : ""}
                        {l.stats.threeDayDriftPct}%</>
                      )}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
      </ul>

      {event.outcomes && event.outcomes.length > 0 ? (
        <>
          <h3 className="detail-sub">Weighted outcomes</h3>
          <p className="field-hint">
            Possible scenarios and their odds. Bar width = probability; color = net
            effect on {selectedAssets.size > 0 ? "your selected assets" : "linked assets"}{" "}
            (<span className="legend-up">▲ up</span> / <span className="legend-down">▼ down</span>).
          </p>
          <OutcomeFan outcomes={event.outcomes} selected={selectedAssets} />
          <OutcomeList outcomes={event.outcomes} selected={selectedAssets} />
        </>
      ) : (
        <p className="muted detail-note">No scenarios available for this event.</p>
      )}
    </aside>
  );
}
