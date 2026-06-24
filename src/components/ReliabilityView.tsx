import type { CalibrationRow } from "../../shared/schema";

interface Props {
  rows: CalibrationRow[];
  selected: Set<string>;
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
export function ReliabilityView({ rows, selected }: Props) {
  const filtered = selected.size > 0 ? rows.filter((r) => selected.has(r.asset)) : rows;

  if (filtered.length === 0) {
    return (
      <p className="muted empty">
        No reliability data yet{selected.size > 0 ? " for the selected assets" : ""}.
      </p>
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
                        <span>{Math.round(r.directionHitRate * 100)}%</span>
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
