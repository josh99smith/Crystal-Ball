import type { MarketEvent } from "../../shared/schema";

export interface FetchWindow {
  from: Date;
  to: Date;
}

/**
 * A source of market events. Providers are intentionally thin: they return raw
 * events with no correlation links — the pipeline attaches links afterward.
 * A provider that is not configured (e.g. missing API key) returns [] rather
 * than throwing, so the pipeline degrades gracefully (PLAN §9).
 */
export interface EventProvider {
  id: string;
  /** True when the provider has the config/keys it needs to fetch real data. */
  isConfigured(): boolean;
  fetchEvents(window: FetchWindow): Promise<MarketEvent[]>;
}
