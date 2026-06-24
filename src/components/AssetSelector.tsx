import type { Asset } from "../../shared/schema";

interface Props {
  assets: Asset[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
}

/** Asset selector (PLAN §2.2) — filters the timeline to relevant events. */
export function AssetSelector({ assets, selected, onToggle, onClear }: Props) {
  return (
    <div className="asset-selector">
      <div className="asset-selector-head">
        <span className="label">Assets</span>
        {selected.size > 0 && (
          <button className="clear" onClick={onClear}>
            Clear ({selected.size})
          </button>
        )}
      </div>
      <div className="chips">
        {assets.map((a) => (
          <button
            key={a.id}
            className={selected.has(a.id) ? "chip active" : "chip"}
            data-class={a.class}
            onClick={() => onToggle(a.id)}
            title={`${a.label} · ${a.class}`}
          >
            {a.id}
          </button>
        ))}
      </div>
    </div>
  );
}
