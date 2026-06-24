// Shareable app state encoded in the URL hash (e.g. #view=timeline&assets=SPX,NDX).

export interface AppUrlState {
  view?: string;
  scale?: string;
  assets?: string[];
  chart?: string;
}

export function readUrlState(): AppUrlState {
  try {
    const p = new URLSearchParams(location.hash.replace(/^#/, ""));
    const assets = p.get("assets");
    return {
      view: p.get("view") ?? undefined,
      scale: p.get("scale") ?? undefined,
      assets: assets ? assets.split(",").filter(Boolean) : undefined,
      chart: p.get("chart") ?? undefined,
    };
  } catch {
    return {};
  }
}

export function writeUrlState(s: AppUrlState): void {
  try {
    const p = new URLSearchParams();
    if (s.view) p.set("view", s.view);
    if (s.scale) p.set("scale", s.scale);
    if (s.assets && s.assets.length) p.set("assets", s.assets.join(","));
    if (s.chart) p.set("chart", s.chart);
    const hash = p.toString();
    history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search);
  } catch {
    /* ignore */
  }
}
