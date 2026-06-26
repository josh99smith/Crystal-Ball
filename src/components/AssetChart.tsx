import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { MarketEvent } from "../../shared/schema";
import { CATEGORY_META } from "../../shared/categories";
import type { PastMarker } from "../usePastEvents";
import type { ChartBar } from "../useChartPrices";

type Mode = "area" | "line" | "candles";

interface Props {
  asset: string;
  series: ChartBar[];
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
  text: string; grid: string; border: string;
  line: string; top: string; bottom: string;
  up: string; down: string; vol: string;
}
function chartTheme(theme: "dark" | "light"): ChartTheme {
  return theme === "light"
    ? { text: "#5a6478", grid: "rgba(90,100,120,0.10)", border: "#d6deec",
        line: "#0ea5a0", top: "rgba(14,165,160,0.18)", bottom: "rgba(14,165,160,0)",
        up: "#0a9e6e", down: "#d4495a", vol: "rgba(90,100,120,0.25)" }
    : { text: "#8b97b0", grid: "rgba(138,151,176,0.08)", border: "#2a3450",
        line: "#36d1c4", top: "rgba(54,209,196,0.25)", bottom: "rgba(54,209,196,0)",
        up: "#3ddc97", down: "#ff5d73", vol: "rgba(138,151,176,0.30)" };
}

const fmtPrice = (n: number) =>
  Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtDay = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export function AssetChart({ asset, series, events, pastMarkers, onSelect, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Area" | "Line" | "Candlestick"> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const barsRef = useRef<Map<number, ChartBar>>(new Map());
  const markersRef = useRef<Map<number, MarkerInfo[]>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const [live, setLive] = useState<ChartBar[] | null>(null);
  const [mode, setMode] = useState<Mode>("area");
  const [showVol, setShowVol] = useState(false);

  // Crypto live fallback.
  useEffect(() => {
    setLive(null);
    if (series.length > 0 || !COINGECKO_ID[asset]) return;
    let active = true;
    fetch(`https://api.coingecko.com/api/v3/coins/${COINGECKO_ID[asset]}/market_chart?vs_currency=usd&days=365&interval=daily`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const pts: Array<[number, number]> | undefined = d?.prices;
        if (active && pts) setLive(pts.map(([ms, c]) => ({ t: Math.floor(ms / 1000), c })));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [asset, series]);

  const effective = series.length > 0 ? series : live ?? [];
  const hasOHLC = useMemo(() => effective.some((b) => b.o != null && b.h != null && b.l != null), [effective]);
  const hasVol = useMemo(
    () => effective.filter((b) => b.v != null).length >= effective.length * 0.4 && effective.length > 0,
    [effective],
  );
  const effMode: Mode = mode === "candles" && !hasOHLC ? "area" : mode;

  const legend = useMemo(() => {
    if (effective.length === 0) return null;
    const s = [...effective].sort((a, b) => a.t - b.t);
    const first = s[0].c, last = s[s.length - 1].c;
    return { last, chgPct: first ? ((last - first) / first) * 100 : 0 };
  }, [effective]);

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const t = chartTheme(theme);
    const chart = createChart(el, {
      width: el.clientWidth, height: el.clientHeight || 380, autoSize: false,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: t.text, fontFamily: "system-ui, sans-serif" },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border },
      timeScale: { borderColor: t.border, timeVisible: false },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    chart.subscribeCrosshairMove((param) => {
      const tip = tooltipRef.current;
      if (!tip) return;
      if (param.time == null || !param.point) { tip.style.display = "none"; return; }
      const day = param.time as number;
      const bar = barsRef.current.get(day);
      const infos = markersRef.current.get(day);
      if (!bar && !infos) { tip.style.display = "none"; return; }
      const lines = [`<b>${fmtDay(day)}</b>`];
      if (bar) {
        if (bar.o != null && bar.h != null && bar.l != null)
          lines.push(`O ${fmtPrice(bar.o)} H ${fmtPrice(bar.h)} L ${fmtPrice(bar.l)} C ${fmtPrice(bar.c)}`);
        else lines.push(`${asset} ${fmtPrice(bar.c)}`);
      }
      if (infos) for (const i of infos.slice(0, 4)) lines.push(`• ${i.title}`);
      tip.innerHTML = lines.join("<br/>");
      tip.style.display = "block";
      const x = Math.min(param.point.x + 14, el.clientWidth - 170);
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
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; priceSeriesRef.current = null; volSeriesRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chart-level theme (no recreate).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const t = chartTheme(theme);
    chart.applyOptions({
      layout: { textColor: t.text },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border },
      timeScale: { borderColor: t.border },
    });
  }, [theme]);

  // (Re)build series + data + markers when data, mode, volume, or theme change.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || effective.length === 0) return;
    const t = chartTheme(theme);

    // Reset series (cheap; the chart instance persists).
    if (priceSeriesRef.current) { chart.removeSeries(priceSeriesRef.current); priceSeriesRef.current = null; }
    if (volSeriesRef.current) { chart.removeSeries(volSeriesRef.current); volSeriesRef.current = null; }

    const bars = new Map<number, ChartBar>();
    for (const b of effective) bars.set(floorDay(b.t), b);
    barsRef.current = bars;
    const days = [...bars.keys()].sort((a, b) => a - b);
    const firstTime = days[0];
    const lastPriceDay = days[days.length - 1];

    let price: ISeriesApi<"Area" | "Line" | "Candlestick">;
    if (effMode === "candles") {
      const s = chart.addCandlestickSeries({
        upColor: t.up, downColor: t.down, borderUpColor: t.up, borderDownColor: t.down,
        wickUpColor: t.up, wickDownColor: t.down, priceLineVisible: false,
      });
      s.setData(days.map((d) => {
        const b = bars.get(d)!;
        return { time: d as UTCTimestamp, open: b.o ?? b.c, high: b.h ?? b.c, low: b.l ?? b.c, close: b.c };
      }));
      price = s;
    } else if (effMode === "line") {
      const s = chart.addLineSeries({ color: t.line, lineWidth: 2, priceLineVisible: false });
      s.setData(days.map((d) => ({ time: d as UTCTimestamp, value: bars.get(d)!.c })));
      price = s;
    } else {
      const s = chart.addAreaSeries({ lineColor: t.line, topColor: t.top, bottomColor: t.bottom, lineWidth: 2, priceLineVisible: false });
      s.setData(days.map((d) => ({ time: d as UTCTimestamp, value: bars.get(d)!.c })));
      price = s;
    }
    priceSeriesRef.current = price;

    if (showVol && hasVol) {
      const vol = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, color: t.vol });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(days.filter((d) => bars.get(d)!.v != null).map((d) => ({ time: d as UTCTimestamp, value: bars.get(d)!.v as number, color: t.vol })));
      volSeriesRef.current = vol;
    }

    // Markers (past + future) on the price series.
    const atTime = new Map<number, MarkerInfo[]>();
    const add = (sec: number, info: MarkerInfo) => {
      const d = floorDay(sec);
      const arr = atTime.get(d) ?? []; arr.push(info); atTime.set(d, arr);
    };
    for (const m of pastMarkers) if (m.assets.includes(asset)) add(m.t, { category: m.category, title: m.title, scheduled: m.scheduled });
    for (const e of events) add(Math.floor(Date.parse(e.scheduledAt) / 1000), { category: e.category, title: e.title, scheduled: e.isScheduled, event: e });
    markersRef.current = atTime;

    const markers: SeriesMarker<Time>[] = [...atTime.entries()].sort((a, b) => a[0] - b[0]).map(([d, infos]) => {
      const top = [...infos].sort((a, b) => (b.event?.expectedImpact ?? 0.4) - (a.event?.expectedImpact ?? 0.4))[0];
      return {
        time: d as UTCTimestamp,
        position: d > lastPriceDay ? "aboveBar" : "belowBar",
        color: CATEGORY_META[top.category].color,
        shape: top.scheduled ? "circle" : "square",
        text: infos.length > 1 ? `${infos.length}` : top.title.slice(0, 12),
      };
    });
    price.setMarkers(markers);

    const nowDay = floorDay(Date.now() / 1000);
    chart.timeScale().setVisibleRange({ from: firstTime as UTCTimestamp, to: (nowDay + 120 * DAY) as UTCTimestamp });
  }, [asset, effective, events, pastMarkers, effMode, showVol, hasVol, theme]);

  if (effective.length === 0) {
    return (
      <p className="muted empty">
        Price series for {asset} isn't available yet. Crypto (BTC) loads live;
        other assets are published by the pipeline — check back after the next refresh.
      </p>
    );
  }

  const upcoming = events.slice().sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)).slice(0, 8);

  return (
    <div className="asset-chart">
      <div className="chart-bar">
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
        <div className="chart-controls">
          <div className="seg" role="group" aria-label="Series type">
            {(["area", "line", "candles"] as Mode[]).map((m) => (
              <button key={m}
                className={effMode === m ? "seg-btn active" : "seg-btn"}
                disabled={m === "candles" && !hasOHLC}
                title={m === "candles" && !hasOHLC ? "No OHLC for this asset" : undefined}
                onClick={() => setMode(m)}>
                {m === "area" ? "Area" : m === "line" ? "Line" : "Candles"}
              </button>
            ))}
          </div>
          <button className={showVol && hasVol ? "seg-btn active" : "seg-btn"}
            disabled={!hasVol} title={!hasVol ? "No volume for this asset" : undefined}
            onClick={() => setShowVol((v) => !v)}>
            Vol
          </button>
        </div>
      </div>
      <div className="asset-chart-wrap">
        <div className="asset-chart-canvas" ref={containerRef} role="img" aria-label={`${asset} price chart with event markers`} />
        <div className="chart-tooltip" ref={tooltipRef} />
      </div>
      <p className="muted chart-note">
        {asset} price (~1y) · markers = our events, past &amp; future (▢ = anticipated).
        Scroll/drag to explore; click a future marker for details.
      </p>
      <div className="visually-hidden">
        <p>{asset}: latest {legend ? fmtPrice(legend.last) : "n/a"}, {legend ? `${legend.chgPct >= 0 ? "up" : "down"} ${Math.abs(legend.chgPct).toFixed(1)}% over the shown window` : ""}.</p>
        {upcoming.length > 0 && (
          <ul>{upcoming.map((e) => (<li key={e.id}>{fmtDay(Date.parse(e.scheduledAt) / 1000)}: {e.title}</li>))}</ul>
        )}
      </div>
    </div>
  );
}
