import type { MarketEvent } from "../shared/schema";
import { earningsLinksFor } from "./correlation/structural";

/**
 * Sample events used when no provider is configured (e.g. local dev without a
 * FRED_API_KEY). Lets the SPA render a realistic timeline. Dates are generated
 * relative to "now" so the timeline always has upcoming events. The ids encode
 * the kind so structural links attach exactly as they would for real FRED data.
 */
export function fixtureEvents(now: Date): MarketEvent[] {
  const day = 24 * 60 * 60 * 1000;
  const at = (days: number) => new Date(now.getTime() + days * day);
  const iso = (d: Date) => d.toISOString();
  const datePart = (d: Date) => d.toISOString().slice(0, 10);

  const make = (
    kind: string,
    title: string,
    days: number,
    expectedImpact: number,
  ): MarketEvent => {
    const when = at(days);
    return {
      id: `fred-${kind}-${datePart(when)}`,
      title: `${title} (sample)`,
      category: "economic-data",
      scheduledAt: iso(when),
      isScheduled: true,
      expectedImpact,
      source: "fixture",
      links: [],
    };
  };

  const earnings = (ticker: string, days: number): MarketEvent => {
    const when = at(days);
    return {
      id: `finnhub-earnings-${ticker}-${datePart(when)}`,
      title: `${ticker} earnings (sample)`,
      category: "earnings",
      scheduledAt: iso(when),
      isScheduled: true,
      expectedImpact: 0.7,
      source: "fixture",
      links: earningsLinksFor(ticker),
    };
  };

  return [
    make("us-cpi", "US CPI", 4, 0.85),
    make("us-nfp", "US Employment Situation (NFP)", 9, 0.85),
    earnings("NVDA", 12),
    make("us-pce", "US Personal Income & Outlays (PCE)", 17, 0.75),
    earnings("AAPL", 21),
    make("us-gdp", "US GDP", 26, 0.7),
    earnings("MSFT", 30),
    make("us-cpi", "US CPI", 34, 0.85),
    make("us-nfp", "US Employment Situation (NFP)", 40, 0.85),
  ];
}
