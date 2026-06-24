import type { Digest, Intelligence, MarketEvent } from "../../shared/schema";
import { DigestView } from "./DigestView";

interface Props {
  intelligence?: Intelligence;
  digest: Digest;
  eventsById: Map<string, MarketEvent>;
  onSelect: (event: MarketEvent) => void;
}

/** The "Brief" surface: narrative + anomaly callouts + the digest (v3.1). */
export function BriefView({ intelligence, digest, eventsById, onSelect }: Props) {
  return (
    <div className="brief">
      {intelligence ? (
        <>
          <div className="brief-head">
            <h3>Market brief</h3>
            <span className={`brief-by by-${intelligence.generatedBy}`}>
              {intelligence.generatedBy === "claude" ? "AI-written" : "auto-generated"}
            </span>
          </div>
          {intelligence.brief.split(/\n\n+/).map((p, i) => (
            <p key={i} className="brief-para">
              {p}
            </p>
          ))}

          {intelligence.anomalies.length > 0 && (
            <div className="brief-anomalies">
              <h4>Callouts</h4>
              <ul>
                {intelligence.anomalies.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="muted">No brief available yet.</p>
      )}

      <h3 className="brief-digest-title">What's coming</h3>
      <DigestView digest={digest} eventsById={eventsById} onSelect={onSelect} />
    </div>
  );
}
