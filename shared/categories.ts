import type { EventCategory } from "./schema";

interface CategoryMeta {
  label: string;
  /** Hex color used for timeline nodes / badges. */
  color: string;
}

export const CATEGORY_META: Record<EventCategory, CategoryMeta> = {
  "monetary-policy": { label: "Monetary policy", color: "#7c5cff" },
  "economic-data": { label: "Economic data", color: "#36d1c4" },
  earnings: { label: "Earnings", color: "#ffb454" },
  "commodity-energy": { label: "Commodity / energy", color: "#ff8a5b" },
  political: { label: "Political", color: "#5b8cff" },
  geopolitical: { label: "Geopolitical", color: "#ff6b6b" },
  crypto: { label: "Crypto", color: "#f7931a" },
  "market-structure": { label: "Market structure", color: "#9aa7c7" },
};
