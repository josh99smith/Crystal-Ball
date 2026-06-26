import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Asset, MarketEvent } from "../../shared/schema";
import { CATEGORY_META } from "../../shared/categories";
import type { PastMarker } from "../usePastEvents";
import type { ChartBar, PriceSeries } from "../useChartPrices";
import { expectedMovePct } from "../strategy";
import { sma } from "../chart/ma";

type Mode = "area" | "line" | "candles";
type RangeKey = "1M" | "3M" | "6M" | "1Y" | "ALL";
const RANGE_DAYS: Record<RangeKey, number> = { "1M": 30, "3M": 92, "6M": 183, "1Y": 365, ALL: 100000 };

interface Props {
  asset: string;
  series: ChartBar[];
  events: MarketEvent[]; // future events linked to this asset
  pastMarkers: PastMarker[]; // past occurrences (all assets)
  onSelect: (event: MarketEvent) => void;
  theme: "dark" | "light";
  allPrices: PriceSeries; // for the comparison overlay (C5)
  assets: Asset[]; // for the comparison picker (C5)
}

interface ChartPrefs {
  mode: Mode; range: RangeKey; showVol: boolean;
  showForward: boolean; showCone: boolean; compare: string; mas: number[];
}
const PREFS_KEY = "cb-chart-prefs";
function loadPrefs(): Partial<ChartPrefs> {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}"); } catch { return {}; }
}

const COMPARE_COLOR = "#f5a623";
const MA_PERIODS = [20, 50, 200] as const;
const MA_COLORS: Record<number, string> = { 20: "#ffd166", 50: "#6ea8fe", 200: "#c792ea" };

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

export function AssetChart({ asset, series, events, pastMarkers, onSelect, theme, allPrices, assets }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Area" | "Line" | "Candlestick"> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const coneRef = useRef<ISeriesApi<"Line">[]>([]);
  const compareRef = useRef<ISeriesApi<"Line"> | null>(null);
  const maRef = useRef<ISeriesApi<"Line">[]>([]);
  const maValuesRef = useRef<Map<number, Map<number, number>>>(new Map());
  const barsRef = useRef<Map<number, ChartBar>>(new Map());
  const markersRef = useRef<Map<number, MarkerInfo[]>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const prefs0 = useRef(loadPrefs()).current;
  const [live, setLive] = useState<ChartBar[] | null>(null);
  const [mode, setMode] = useState<Mode>(prefs0.mode ?? "area");
  const [showVol, setShowVol] = useState(prefs0.showVol ?? false);
  const [range, setRange] = useState<RangeKey>(prefs0.range ?? "1Y");
  const [showForward, setShowForward] = useState(prefs0.showForward ?? true);
  const [showCone, setShowCone] = useState(prefs0.showCone ?? true);
  const [compare, setCompare] = useState<string>(prefs0.compare ?? "");
  const [mas, setMas] = useState<Set<number>>(new Set(prefs0.mas ?? []));
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());

  // Persist chart preferences across reloads.
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ mode, range, showVol, showForward, showCone, compare, mas: [...mas] }));
    } catch { /* ignore */ }
  }, [mode, range, showVol, showForward, showCone, compare, mas]);

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

  // Categories present for this asset (for the filter chips).
  const presentCats = useMemo(() => {
    const set = new Set<MarketEvent["category"]>();
    for (const m of pastMarkers) if (m.assets.includes(asset)) set.add(m.category);
    for (const e of events) set.add(e.category);
    return [...set];
  }, [pastMarkers, events, asset]);

  const compareChg = useMemo(() => {
    if (!compare || !allPrices[compare]?.length) return null;
    const s = [...allPrices[compare]].sort((a, b) => a.t - b.t);
    if (s.length < 2) return null;
    const f = s[0].c, l = s[s.length - 1].c;
    return f ? ((l - f) / f) * 100 : 0;
  }, [compare, allPrices]);

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
      const maParts: string[] = [];
      for (const p of [...maValuesRef.current.keys()].sort((a, b) => a - b)) {
        const v = maValuesRef.current.get(p)?.get(day);
        if (v != null) maParts.push(`MA${p} ${fmtPrice(v)}`);
      }
      if (maParts.length) lines.push(`<span class="tt-meta">${maParts.join(" · ")}</span>`);
      if (infos) {
        for (const i of infos.slice(0, 3)) {
          let s = `• ${i.title}`;
          if (i.event) {
            const top = [...(i.event.outcomes ?? [])].sort((a, b) => b.weight - a.weight)[0];
            const bits: string[] = [`impact ${Math.round(i.event.expectedImpact * 100)}%`];
            if (top) bits.push(`${top.label} ${Math.round(top.weight * 100)}%`);
            if (i.event.impliedMove) bits.push(`±${i.event.impliedMove.movePct}% implied`);
            s += `<span class="tt-meta"> — ${bits.join(" · ")}</span>`;
          }
          lines.push(s);
        }
        if (infos.length > 3) lines.push(`<span class="tt-meta">+${infos.length - 3} more</span>`);
      }
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
    for (const m of pastMarkers)
      if (m.assets.includes(asset) && !hiddenCats.has(m.category))
        add(m.t, { category: m.category, title: m.title, scheduled: m.scheduled });
    for (const e of events)
      if (!hiddenCats.has(e.category))
        add(Math.floor(Date.parse(e.scheduledAt) / 1000), { category: e.category, title: e.title, scheduled: e.isScheduled, event: e });
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
  }, [asset, effective, events, pastMarkers, effMode, showVol, hasVol, theme, hiddenCats]);

  // Visible range (preset + forward toggle) — independent of series rebuilds.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || effective.length === 0) return;
    const days = effective.map((b) => floorDay(b.t));
    const firstTime = Math.min(...days);
    const lastDataDay = Math.max(...days);
    const nowDay = floorDay(Date.now() / 1000);
    const span = RANGE_DAYS[range] * DAY;
    const from = range === "ALL" ? firstTime : Math.max(firstTime, nowDay - span);
    const to = showForward ? nowDay + 120 * DAY : lastDataDay;
    chart.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: to as UTCTimestamp });
  }, [range, showForward, effective]);

  // C4 — forward scenario cone from the next event's weighted outcomes (+ band).
  useEffect(() => {
    const chart = chartRef.current;
    for (const s of coneRef.current) chart?.removeSeries(s);
    coneRef.current = [];
    if (!chart || !showCone || effective.length === 0) return;
    const sorted = [...effective].sort((a, b) => a.t - b.t);
    const lastClose = sorted[sorted.length - 1].c;
    const nowDay = floorDay(Date.now() / 1000);
    const next = [...events]
      .filter((e) => e.outcomes?.length)
      .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
    if (!next) return;
    const eventDay = floorDay(Date.parse(next.scheduledAt) / 1000);
    if (eventDay <= nowDay) return;
    const { evPct } = expectedMovePct(next, asset);
    const link = next.links.find((l) => l.asset === asset);
    const band = Math.min(25, link?.stats?.avgAbsMovePct ?? Math.abs(evPct) + 0.8);
    if (evPct === 0 && band === 0) return;
    const color = theme === "light" ? "rgba(120,90,200,0.85)" : "rgba(168,148,255,0.9)";
    const line = (mvPct: number, style: LineStyle, width: 1 | 2) => {
      const s = chart.addLineSeries({ color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData([
        { time: nowDay as UTCTimestamp, value: lastClose },
        { time: eventDay as UTCTimestamp, value: lastClose * (1 + mvPct / 100) },
      ]);
      return s;
    };
    const center = line(evPct, LineStyle.Dashed, 2);
    center.setMarkers([{ time: eventDay as UTCTimestamp, position: "aboveBar", color, shape: "circle", text: `EV ${evPct >= 0 ? "+" : ""}${evPct.toFixed(1)}%` }]);
    coneRef.current = [center, line(evPct + band, LineStyle.Dotted, 1), line(evPct - band, LineStyle.Dotted, 1)];
  }, [asset, effective, events, showCone, theme]);

  // C5 — comparison overlay: a second asset rebased to the main's first close.
  useEffect(() => {
    const chart = chartRef.current;
    if (compareRef.current) { chart?.removeSeries(compareRef.current); compareRef.current = null; }
    if (!chart || !compare || compare === asset || effective.length === 0) return;
    const cmp = allPrices[compare];
    if (!cmp || cmp.length === 0) return;
    const mainFirst = [...effective].sort((a, b) => a.t - b.t)[0].c;
    const cmpSorted = [...cmp].sort((a, b) => a.t - b.t);
    const cmpFirst = cmpSorted[0].c;
    if (!mainFirst || !cmpFirst) return;
    const byDay = new Map<number, number>();
    for (const b of cmpSorted) byDay.set(floorDay(b.t), mainFirst * (b.c / cmpFirst));
    const s = chart.addLineSeries({ color: COMPARE_COLOR, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    s.setData([...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ time: t as UTCTimestamp, value: v })));
    compareRef.current = s;
  }, [compare, asset, allPrices, effective, theme]);

  // Moving-average overlays (SMA 20/50/200).
  useEffect(() => {
    const chart = chartRef.current;
    for (const s of maRef.current) chart?.removeSeries(s);
    maRef.current = [];
    maValuesRef.current = new Map();
    if (!chart || effective.length === 0 || mas.size === 0) return;
    const sorted = [...effective].sort((a, b) => a.t - b.t);
    const days = sorted.map((b) => floorDay(b.t));
    const closes = sorted.map((b) => b.c);
    for (const period of [...mas].sort((a, b) => a - b)) {
      const vals = sma(closes, period);
      const data: { time: UTCTimestamp; value: number }[] = [];
      const valueMap = new Map<number, number>();
      for (let i = 0; i < vals.length; i++) {
        const v = vals[i];
        if (v == null) continue;
        data.push({ time: days[i] as UTCTimestamp, value: v });
        valueMap.set(days[i], v);
      }
      if (data.length === 0) continue;
      const line = chart.addLineSeries({
        color: MA_COLORS[period], lineWidth: 1, priceLineVisible: false,
        lastValueVisible: false, crosshairMarkerVisible: false,
      });
      line.setData(data);
      maRef.current.push(line);
      maValuesRef.current.set(period, valueMap);
    }
  }, [asset, effective, mas, theme]);

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
          {compare && compareChg != null && (
            <span className="cl-cmp" style={{ color: COMPARE_COLOR }}>
              vs {compare} {compareChg >= 0 ? "▲" : "▼"} {Math.abs(compareChg).toFixed(1)}%
            </span>
          )}
        </div>
        <div className="chart-controls">
          <div className="seg" role="group" aria-label="Time range">
            {(Object.keys(RANGE_DAYS) as RangeKey[]).map((r) => (
              <button key={r} className={range === r ? "seg-btn active" : "seg-btn"} onClick={() => setRange(r)}>
                {r}
              </button>
            ))}
          </div>
          <button className={showForward ? "seg-btn active" : "seg-btn"}
            title="Show upcoming events to the right of today"
            onClick={() => setShowForward((v) => !v)}>
            Fwd
          </button>
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
          <button className={showCone ? "seg-btn active" : "seg-btn"}
            title="Project the next event's weighted-outcome expected move (scenario, not a prediction)"
            onClick={() => setShowCone((v) => !v)}>
            Cone
          </button>
          <div className="seg" role="group" aria-label="Moving averages">
            {MA_PERIODS.map((p) => {
              const on = mas.has(p);
              return (
                <button key={p}
                  className={on ? "seg-btn active" : "seg-btn"}
                  style={on ? { color: MA_COLORS[p] } : undefined}
                  title={`${p}-day simple moving average`}
                  onClick={() =>
                    setMas((prev) => {
                      const next = new Set(prev);
                      next.has(p) ? next.delete(p) : next.add(p);
                      return next;
                    })
                  }>
                  MA{p}
                </button>
              );
            })}
          </div>
          <select className="seg-btn cmp-select" value={compare}
            aria-label="Compare with asset" onChange={(e) => setCompare(e.target.value)}>
            <option value="">Compare…</option>
            {assets.filter((a) => a.id !== asset).map((a) => (
              <option key={a.id} value={a.id}>vs {a.id}</option>
            ))}
          </select>
        </div>
      </div>

      {presentCats.length > 1 && (
        <div className="chart-cats">
          <span className="field-hint cc-label">Events:</span>
          {presentCats.map((c) => {
            const on = !hiddenCats.has(c);
            return (
              <button key={c}
                className={on ? "cc-chip on" : "cc-chip"}
                style={on ? { borderColor: CATEGORY_META[c].color } : undefined}
                onClick={() =>
                  setHiddenCats((prev) => {
                    const next = new Set(prev);
                    next.has(c) ? next.delete(c) : next.add(c);
                    return next;
                  })
                }>
                <span className="cc-dot" style={{ background: CATEGORY_META[c].color }} />
                {CATEGORY_META[c].label}
              </button>
            );
          })}
        </div>
      )}
      <div className="asset-chart-wrap">
        <div className="asset-chart-canvas" ref={containerRef} role="img" aria-label={`${asset} price chart with event markers`} />
        <div className="chart-tooltip" ref={tooltipRef} />
      </div>
      <p className="muted chart-note">
        Markers = our events (▢ = anticipated); click a future one for details.
        {showCone && " Dashed/dotted cone = next event's expected move ± typical reaction — a scenario, not a prediction."}
        {compare && ` Orange = ${compare}, rebased to ${asset}'s start for relative performance.`}
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
