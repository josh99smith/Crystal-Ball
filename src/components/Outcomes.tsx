import type { AssetImpact, Direction, Outcome, WeightSource } from "../../shared/schema";

const DIR_COLOR: Record<Direction, string> = {
  up: "#5bd6a0",
  down: "#ff6b6b",
  neutral: "#6b7690",
};
const DIR_GLYPH: Record<Direction, string> = { up: "▲", down: "▼", neutral: "–" };
const DIR_WORD: Record<Direction, string> = { up: "up", down: "down", neutral: "flat" };
const MAG_WEIGHT = { low: 1, med: 2, high: 3 } as const;

const SOURCE_TIP: Record<WeightSource, string> = {
  "market-implied": "Probability implied by market prices (e.g. rate futures / Treasuries)",
  consensus: "Based on analyst / economist consensus expectations",
  historical: "Based on how often each outcome has occurred historically",
  model: "Estimated by the model",
};

/** Net direction of an outcome, optionally biased to the user's selected assets. */
export function netDirection(o: Outcome, selected: Set<string>): Direction {
  const impacts = o.assetImpacts.filter(
    (i) => selected.size === 0 || selected.has(i.asset),
  );
  const pool = impacts.length ? impacts : o.assetImpacts;
  let score = 0;
  for (const i of pool) {
    const w = MAG_WEIGHT[i.magnitude];
    if (i.direction === "up") score += w;
    else if (i.direction === "down") score -= w;
  }
  return score > 0 ? "up" : score < 0 ? "down" : "neutral";
}

/** The weighted "fan": a stacked probability bar across outcomes. */
export function OutcomeFan({
  outcomes,
  selected,
}: {
  outcomes: Outcome[];
  selected: Set<string>;
}) {
  return (
    <div className="fan" role="img" aria-label="Weighted outcomes">
      {outcomes.map((o) => {
        const dir = netDirection(o, selected);
        return (
          <div
            key={o.id}
            className="fan-seg"
            style={{ width: `${o.weight * 100}%`, background: DIR_COLOR[dir] }}
            title={`${o.label} — ${Math.round(o.weight * 100)}%`}
          >
            {o.weight >= 0.15 ? `${Math.round(o.weight * 100)}%` : ""}
          </div>
        );
      })}
    </div>
  );
}

function ImpactChip({ impact, hit }: { impact: AssetImpact; hit: boolean }) {
  return (
    <span
      className={hit ? "impact-chip hit" : "impact-chip"}
      title={`${impact.asset}: expected ${DIR_WORD[impact.direction]} move, ${impact.magnitude} magnitude`}
    >
      <span style={{ color: DIR_COLOR[impact.direction] }}>
        {DIR_GLYPH[impact.direction]}
      </span>
      {impact.asset}
      <i className={`mag mag-${impact.magnitude}`} />
    </span>
  );
}

/** Full breakdown: each outcome with weight, source, rationale, impact chips. */
export function OutcomeList({
  outcomes,
  selected,
}: {
  outcomes: Outcome[];
  selected: Set<string>;
}) {
  return (
    <ul className="outcomes">
      {[...outcomes]
        .sort((a, b) => b.weight - a.weight)
        .map((o) => {
          const dir = netDirection(o, selected);
          return (
            <li key={o.id} className="outcome">
              <div className="outcome-head">
                <span className="oc-weight" style={{ color: DIR_COLOR[dir] }}>
                  {Math.round(o.weight * 100)}%
                </span>
                <span className="oc-label">{o.label}</span>
                <span className={`oc-src src-${o.weightSource}`} title={SOURCE_TIP[o.weightSource]}>
                  {o.weightSource}
                </span>
              </div>
              {o.rationale && <p className="oc-rationale">{o.rationale}</p>}
              {o.provenance && <p className="oc-provenance">basis: {o.provenance}</p>}
              {o.assetImpacts.length > 0 && (
                <div className="oc-impacts">
                  {o.assetImpacts.map((im) => (
                    <ImpactChip key={im.asset} impact={im} hit={selected.has(im.asset)} />
                  ))}
                </div>
              )}
            </li>
          );
        })}
    </ul>
  );
}
