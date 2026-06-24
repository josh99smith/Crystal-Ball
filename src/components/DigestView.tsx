import type { Digest, DigestItem, MarketEvent } from "../../shared/schema";
import { CATEGORY_META } from "../../shared/categories";

interface Props {
  digest: Digest;
  eventsById: Map<string, MarketEvent>;
  onSelect: (event: MarketEvent) => void;
}

function Section({
  title,
  items,
  eventsById,
  onSelect,
}: {
  title: string;
  items: DigestItem[];
} & Pick<Props, "eventsById" | "onSelect">) {
  return (
    <div className="digest-section">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">Nothing notable.</p>
      ) : (
        <ul className="digest-list">
          {items.map((it) => {
            const meta = CATEGORY_META[it.category];
            const event = eventsById.get(it.eventId);
            return (
              <li key={it.eventId}>
                <button
                  className="digest-item"
                  onClick={() => event && onSelect(event)}
                  disabled={!event}
                >
                  <span className="di-date">
                    {new Date(it.scheduledAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="di-dot" style={{ background: meta.color }} />
                  <span className="di-title">{it.title}</span>
                  <span className="di-assets">{it.topAssets.join(" · ")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The generated digest surface (PLAN §2 — daily/weekly). */
export function DigestView({ digest, eventsById, onSelect }: Props) {
  return (
    <div className="digest">
      <p className="digest-headline">{digest.headline}</p>
      <Section
        title="Next 7 days"
        items={digest.daily}
        eventsById={eventsById}
        onSelect={onSelect}
      />
      <Section
        title="Next 30 days"
        items={digest.weekly}
        eventsById={eventsById}
        onSelect={onSelect}
      />
    </div>
  );
}
