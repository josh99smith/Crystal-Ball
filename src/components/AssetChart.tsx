import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
  type LineData,
} from "lightweight-charts";
import type { MarketEvent } from "../../shared/schema";
import { CATEGORY_META } from "../../shared/categories";
import type { PastMarker } from "../usePastEvents";

interface Props {
  asset: string;
  series: Array<{ t: number; c: number }>;
  events: MarketEvent[]; // future events linked to this asset
  pastMarkers: PastMarker[]; // past occurrences (all assets)
  onSelect: (event: MarketEvent) => void;
  theme: "dark" | "light";
}

const DAY = 86400;
const floorDay = (sec: number) => Math.floor(sec / DAY) * DAY;
const COINGECKO_ID: Record<string, string> = { BTC: "bitcoin" };

interface MarkerInfo {
  category: MarketEvent["category"];
  title: string;
  scheduled: boolean;
  event?: MarketEvent;
}

interface ChartTheme {
  text: string;
  grid: string;
  border: string;
  line: string;
  top: string;
  bottom: string;
}

function chartTheme(theme: "dark" | "light"): ChartTheme {
  return theme === "light"
    ? {
        text: "#5a6478",
        grid: "rgba(90,100,120,0.10)",
        border: "#d6deec",
        line: "#0ea5a0",
        top: "rgba(14,165,160,0.18)",
        bottom: "rgba(14,165,160,0)",
      }
    : {
        text: "#8b97b0",
        grid: "rgba(138,151,176,0.08)",
        border: "#2a3450",
        line: "#36d1c4",
        top: "rgba(54,209,196,0.25)",
        bottom: "rgba(54,209,196,0)",
      };
}

const fmtPrice = (n: number) =>
  Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtDay = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Asset price chart (overhaul C0): create-once + update, theme-aware, with a
 * custom crosshair tooltip, a legend, and an accessible data-summary fallback.
 */
export function AssetChart({ asset, series, events, pastMarkers, onSelect, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaRef = useRef<ISeriesApi<"Area"> | null>(null);
  const barsRef = useRef<Map<number, number>>(new Map()); // day → close
  const markersRef = useRef<Map<number, MarkerInfo[]>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const [live, setLive] = useState<Array<{ t: number; c: number }> | null>(null);

  // Crypto: fetch live client-side (CoinGecko) when the pipeline has no series.
  useEffect(() => {
    setLive(null);
    if (series.length > 0 || !COINGECKO_ID[asset]) return;
    let active = true;
    fetch(
      `https://api.coingecko.com/api/v3/coins/${COINGECKO_ID[asset]}/market_chart?vs_currency=usd&days=365&interval=daily`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const pts: Array<[number, number]> | undefined = d?.prices;
        if (active && pts) setLive(pts.map(([ms, c]) => ({ t: Math.floor(ms / 1000), c })));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [asset, series]);

  const effective = series.length > 0 ? series : live ?? [];

  // Legend stats (last price + change over the shown window).
  const legend = useMemo(() => {
    if (effective.length === 0) return null;
    const sorted = [...effective].sort((a, b) => a.t - b.t);
    const first = sorted[0].c;
    const last = sorted[sorted.length - 1].c;
    const chgPct = first ? ((last - first) / first) * 100 : 0;
    return { last, chgPct };
  }, [effective]);

  // --- Create the chart once -------------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const t = chartTheme(theme);
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight || 380,
      autoSize: false,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: t.text,
        fontFamily: "system-ui, sans-serif",
      },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border },
      timeScale: { borderColor: t.border, timeVisible: false },
      crosshair: { mode: 0 },
    });
    const area = chart.addAreaSeries({
      lineColor: t.line,
      topColor: t.top,
      bottomColor: t.bottom,
      lineWidth: 2,
      priceLineVisible: false,
    });
    chartRef.current = chart;
    areaRef.current = area;

    // Custom crosshair tooltip.
    chart.subscribeCrosshairMove((param) => {
      const tip = tooltipRef.current;
      if (!tip) return;
      if (param.time == null || !param.point) {
        tip.style.display = "none";
        return;
      }
      const day = param.time as number;
      const price = barsRef.current.get(day);
      const infos = markersRef.current.get(day);
      if (price == null && !infos) {
        tip.style.display = "none";
        return;
      }
      const lines = [`<b>${fmtDay(day)}</b>`];
      if (price != null) lines.push(`${asset} ${fmtPrice(price)}`);
      if (infos) for (const i of infos.slice(0, 4)) lines.push(`• ${i.title}`);
      tip.innerHTML = lines.join("<br/>");
      tip.style.display = "block";
      const x = Math.min(param.point.x + 14, el.clientWidth - 160);
      tip.style.left = `${Math.max(4, x)}px`;
      tip.style.top = `${Math.max(4, param.point.y - 8)}px`;
    });

    chart.subscribeClick((param) => {
      if (param.time == null) return;
      const infos = markersRef.current.get(param.time as number);
      const ev = infos?.map((i) => i.event).filter(Boolean)[0];
      if (ev) onSelectRef.current(ev);
    });

    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) chart.applyOptions({ width: r.width, height: r.height });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      areaRef.current = null;
    };
    // create-once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Apply theme without recreating ---------------------------------------
  useEffect(() => {
    const chart = chartRef.current;
    const area = areaRef.current;
    if (!chart || !area) return;
    const t = chartTheme(theme);
    chart.applyOptions({
      layout: { textColor: t.text },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border },
      timeScale: { borderColor: t.border },
    });
    area.applyOptions({ lineColor: t.line, topColor: t.top, bottomColor: t.bottom });
  }, [theme]);

  // --- Update data + markers + range ----------------------------------------
  useEffect(() => {
    const chart = chartRef.current;
    const area = areaRef.current;
    if (!chart || !area || effective.length === 0) return;

    const byTime = new Map<number, LineData<Time> | WhitespaceData<Time>>();
    const bars = new Map<number, number>();
    for (const p of effective) {
      const d = floorDay(p.t);
      byTime.set(d, { time: d as UTCTimestamp, value: p.c });
      bars.set(d, p.c);
    }
    barsRef.current = bars;
    const firstTime = Math.min(...bars.keys());
    const lastPriceDay = Math.max(...bars.keys());

    const atTime = new Map<number, MarkerInfo[]>();
    const add = (sec: number, info: MarkerInfo) => {
      const d = floorDay(sec);
      const arr = atTime.get(d) ?? [];
      arr.push(info);
      atTime.set(d, arr);
    };
    for (const m of pastMarkers)
      if (m.assets.includes(asset)) add(m.t, { category: m.category, title: m.title, scheduled: m.scheduled });
    for (const e of events)
      add(Math.floor(Date.parse(e.scheduledAt) / 1000), {
        category: e.category, title: e.title, scheduled: e.isScheduled, event: e,
      });
    markersRef.current = atTime;

    for (const t of atTime.keys()) if (!byTime.has(t)) byTime.set(t, { time: t as UTCTimestamp });
    area.setData([...byTime.values()].sort((a, b) => (a.time as number) - (b.time as number)));

    const markers: SeriesMarker<Time>[] = [...atTime.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, infos]) => {
        const top = [...infos].sort(
          (a, b) => (b.event?.expectedImpact ?? 0.4) - (a.event?.expectedImpact ?? 0.4),
        )[0];
        return {
          time: t as UTCTimestamp,
          position: t > lastPriceDay ? "aboveBar" : "belowBar",
          color: CATEGORY_META[top.category].color,
          shape: top.scheduled ? "circle" : "square",
          text: infos.length > 1 ? `${infos.length}` : top.title.slice(0, 12),
        };
      });
    area.setMarkers(markers);

    const nowDay = floorDay(Date.now() / 1000);
    chart.timeScale().setVisibleRange({
      from: firstTime as UTCTimestamp,
      to: (nowDay + 120 * DAY) as UTCTimestamp,
    });
  }, [asset, effective, events, pastMarkers]);

  if (effective.length === 0) {
    return (
      <p className="muted empty">
        Price series for {asset} isn't available yet. Crypto (BTC) loads live;
        other assets are published by the pipeline — check back after the next refresh.
      </p>
    );
  }

  const upcoming = events
    .slice()
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
    .slice(0, 8);

  return (
    <div className="asset-chart">
      <div className="chart-legend">
        <span className="cl-asset">{asset}</span>
        {legend && (
          <>
            <span className="cl-price">{fmtPrice(legend.last)}</span>
            <span className={legend.chgPct >= 0 ? "cl-chg up" : "cl-chg down"}>
              {legend.chgPct >= 0 ? "▲" : "▼"} {Math.abs(legend.chgPct).toFixed(1)}% (shown)
            </span>
          </>
        )}
      </div>
      <div className="asset-chart-wrap">
        <div className="asset-chart-canvas" ref={containerRef} role="img"
          aria-label={`${asset} price chart with event markers`} />
        <div className="chart-tooltip" ref={tooltipRef} />
      </div>
      <p className="muted chart-note">
        {asset} price (~1y) · markers = our events, past &amp; future (▢ = anticipated).
        Scroll/drag to explore; click a future marker for details.
      </p>
      {/* Accessible fallback: not rendered visually. */}
      <div className="visually-hidden">
        <p>
          {asset}: latest {legend ? fmtPrice(legend.last) : "n/a"},{" "}
          {legend ? `${legend.chgPct >= 0 ? "up" : "down"} ${Math.abs(legend.chgPct).toFixed(1)}% over the shown window` : ""}.
        </p>
        {upcoming.length > 0 && (
          <ul>
            {upcoming.map((e) => (
              <li key={e.id}>{fmtDay(Date.parse(e.scheduledAt) / 1000)}: {e.title}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
