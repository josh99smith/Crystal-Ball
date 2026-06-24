import type { Digest, DigestItem, MarketEvent } from "../shared/schema";

const DAY = 24 * 60 * 60 * 1000;

function toItem(event: MarketEvent): DigestItem {
  const topAssets = [...event.links]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3)
    .map((l) => l.asset);
  return {
    eventId: event.id,
    title: event.title,
    scheduledAt: event.scheduledAt,
    category: event.category,
    expectedImpact: event.expectedImpact,
    topAssets,
  };
}

/** Picks notable events within `days`, sorted by impact then date. */
function notable(events: MarketEvent[], now: number, days: number, max: number) {
  const horizon = now + days * DAY;
  return events
    .filter((e) => {
      const t = Date.parse(e.scheduledAt);
      return t >= now && t <= horizon;
    })
    .sort(
      (a, b) =>
        b.expectedImpact - a.expectedImpact ||
        Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
    )
    .slice(0, max)
    .map(toItem);
}

export function buildDigest(events: MarketEvent[], now: Date): Digest {
  const ms = now.getTime();
  const daily = notable(events, ms, 7, 6);
  const weekly = notable(events, ms, 30, 10);

  const highImpact = daily.filter((d) => d.expectedImpact >= 0.8).length;
  const headline =
    daily.length === 0
      ? "Quiet week ahead — no notable scheduled events in the next 7 days."
      : `${daily.length} notable event${daily.length > 1 ? "s" : ""} in the next 7 days` +
        (highImpact > 0 ? `, ${highImpact} high-impact.` : ".");

  return { generatedAt: now.toISOString(), headline, daily, weekly };
}

/** Renders the digest as Markdown for non-app consumers (email, etc.). */
export function digestToMarkdown(digest: Digest): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  const line = (i: DigestItem) =>
    `- **${fmt(i.scheduledAt)}** — ${i.title} (${i.category}, impact ${i.expectedImpact.toFixed(
      2,
    )})${i.topAssets.length ? ` · ${i.topAssets.join(", ")}` : ""}`;

  return [
    `# Crystal-Ball Digest`,
    ``,
    `_Generated ${new Date(digest.generatedAt).toUTCString()}_`,
    ``,
    `**${digest.headline}**`,
    ``,
    `## Next 7 days`,
    digest.daily.length ? digest.daily.map(line).join("\n") : "_Nothing notable._",
    ``,
    `## Next 30 days`,
    digest.weekly.length ? digest.weekly.map(line).join("\n") : "_Nothing notable._",
    ``,
    `_Not financial advice._`,
    ``,
  ].join("\n");
}
