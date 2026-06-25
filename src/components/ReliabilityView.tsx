import type { CalibrationMetrics, CalibrationRow } from "../../shared/schema";

interface Props {
  rows: CalibrationRow[];
  loop?: CalibrationMetrics;
  selected: Set<string>;
}

/** Live calibration from the scored predictions ledger (v2.3). */
function LoopSection({ loop }: { loop?: CalibrationMetrics }) {
  if (!loop || loop.resolved === 0) {
    return (
      <div className="rel-group">
        <h3>Live calibration</h3>
        <p className="muted">
          Accrues as logged predictions resolve.{" "}
          {loop ? `${loop.pending} prediction(s) pending` : "No ledger yet"} — check
          back after upcoming events occur.
        </p>
      </div>
    );
  }
  return (
    <div className="rel-group">
      <h3>Live calibration · directional</h3>
      <p className="muted rel-loop-summary">
        {loop.resolved} resolved · {loop.pending} pending
        {loop.brier != null && <> · Brier {loop.brier.toFixed(3)} (lower is better)</>}
      </p>
      <table className="rel-table">
        <thead>
          <tr>
            <th>Confidence</th>
            <th>Predicted</th>
            <th>Actual hit-rate</th>
            <th>n</th>
          </tr>
        </thead>
        <tbody>
          {loop.bands.map((b) => (
            <tr key={b.lo}>
              <td className="rel-asset">
                {Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}%
              </td>
              <td className="muted">{Math.round(b.avgConfidence * 100)}%</td>
              <td>
                <div className="rel-bar">
                  <div
                    className={
                      Math.abs(b.hitRate - b.avgConfidence) <= 0.1 ? "rel-hit good" : "rel-hit ok"
                    }
                    style={{ width: `${b.hitRate * 100}%` }}
                  />
                  <span>
                    {Math.round(b.hitRate * 100)}%
                    {b.hitRateCiLow != null && b.hitRateCiHigh != null && (
                      <em className="rel-ci">
                        {" "}±CI {Math.round(b.hitRateCiLow * 100)}–{Math.round(b.hitRateCiHigh * 100)}%
                      </em>
                    )}
                  </span>
                </div>
              </td>
              <td className="muted">{b.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted rel-note">
        Well-calibrated = actual hit-rate ≈ predicted. Directional: did the asset
        move the way the weighted outcomes implied?
      </p>
    </div>
  );
}

function hitClass(h: number): string {
  if (h >= 0.7) return "rel-hit good";
  if (h >= 0.6) return "rel-hit ok";
  return "rel-hit weak";
}

/**
 * Reliability / calibration scorecard (PLAN §6, §11). Aggregates the event-study
 * stats: for each event type × asset, how reliably it moved (same-direction hit
 * rate), how much (avg |move|), and over how many occurrences (n).
 */
export function ReliabilityView({ rows, loop, selected }: Props) {
  const filtered = selected.size > 0 ? rows.filter((r) => selected.has(r.asset)) : rows;

  if (filtered.length === 0) {
    return (
      <div className="reliability">
        <LoopSection loop={loop} />
        <p className="muted empty">
          No event-study data yet{selected.size > 0 ? " for the selected assets" : ""}.
        </p>
      </div>
    );
  }

  const totalN = filtered.reduce((s, r) => s + r.n, 0);
  const weightedHit =
    totalN > 0 ? filtered.reduce((s, r) => s + r.directionHitRate * r.n, 0) / totalN : 0;

  const byKind = new Map<string, { label: string; rows: CalibrationRow[] }>();
  for (const r of filtered) {
    if (!byKind.has(r.kind)) byKind.set(r.kind, { label: r.kindLabel, rows: [] });
    byKind.get(r.kind)!.rows.push(r);
  }

  return (
    <div className="reliability">
      <LoopSection loop={loop} />

      <h3 className="rel-section-title">Event-study scorecard</h3>
      <p className="field-hint">
        For each event type × asset: how often the asset moved the same direction
        ("same-dir") with its 95% confidence interval, the average move size, the
        sample size (n), and an overall strength score. Strength uses a hit rate
        shrunk toward 50% by sample size, so a small-n "edge" can't inflate it.
      </p>
      <div className="rel-summary">
        <div>
          <span className="rel-big">{Math.round(weightedHit * 100)}%</span>
          <span className="muted"> weighted same-direction rate</span>
        </div>
        <div className="muted">
          {filtered.length} event→asset relationships · {totalN} past occurrences sampled
        </div>
      </div>

      {[...byKind.values()].map((group) => (
        <div key={group.label} className="rel-group">
          <h3>{group.label}</h3>
          <table className="rel-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Same-dir</th>
                <th>Avg |move|</th>
                <th>n</th>
                <th>Strength</th>
              </tr>
            </thead>
            <tbody>
              {group.rows
                .sort((a, b) => b.strength - a.strength)
                .map((r) => (
                  <tr key={r.asset} className={selected.has(r.asset) ? "hit" : ""}>
                    <td className="rel-asset">{r.asset}</td>
                    <td>
                      <div className="rel-bar">
                        <div
                          className={hitClass(r.directionHitRate)}
                          style={{ width: `${r.directionHitRate * 100}%` }}
                        />
                        <span>
                          {Math.round(r.directionHitRate * 100)}%
                          {r.hitRateCiLow != null && r.hitRateCiHigh != null && (
                            <em className="rel-ci">
                              {" "}({Math.round(r.hitRateCiLow * 100)}–{Math.round(r.hitRateCiHigh * 100)})
                            </em>
                          )}
                        </span>
                      </div>
                    </td>
                    <td>{r.avgAbsMovePct.toFixed(1)}%</td>
                    <td className="muted">{r.n}</td>
                    <td>{r.strength.toFixed(2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}

      <p className="muted rel-note">
        Same-direction rate = share of past occurrences the asset moved the same
        way (direction consistency), not a forecast. Calibration is observational
        and degrades in regime changes.
      </p>
    </div>
  );
}
