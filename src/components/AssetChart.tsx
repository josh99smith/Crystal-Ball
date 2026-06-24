import { useEffect, useRef, useState } from "react";
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

interface Props {
  asset: string;
  series: Array<{ t: number; c: number }>;
  events: MarketEvent[]; // events linked to this asset
  onSelect: (event: MarketEvent) => void;
}

const DAY = 86400;
const floorDay = (sec: number) => Math.floor(sec / DAY) * DAY;

// Crypto can be fetched live, client-side (keyless, CORS-friendly) — no CI needed.
const COINGECKO_ID: Record<string, string> = { BTC: "bitcoin" };

/**
 * TradingView Lightweight Charts (MIT) rendering an asset's price series with our
 * events overlaid as markers. Future events extend the axis via whitespace so
 * their markers render beyond the last price bar.
 */
export function AssetChart({ asset, series, events, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<Array<{ t: number; c: number }> | null>(null);

  // If the pipeline has no series for a crypto asset, fetch it live (CoinGecko).
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

  useEffect(() => {
    const el = containerRef.current;
    if (!el || effective.length === 0) return;

    const chart: IChartApi = createChart(el, {
      width: el.clientWidth,
      height: 360,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b97b0",
        fontFamily: "system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(138,151,176,0.08)" },
        horzLines: { color: "rgba(138,151,176,0.08)" },
      },
      rightPriceScale: { borderColor: "#2a3450" },
      timeScale: { borderColor: "#2a3450", timeVisible: false },
      crosshair: { mode: 0 },
    });

    const area: ISeriesApi<"Area"> = chart.addAreaSeries({
      lineColor: "#36d1c4",
      topColor: "rgba(54,209,196,0.25)",
      bottomColor: "rgba(54,209,196,0)",
      lineWidth: 2,
      priceLineVisible: false,
    });

    // Price points (day-floored, deduped, ascending).
    const byTime = new Map<number, LineData<Time> | WhitespaceData<Time>>();
    for (const p of effective) {
      byTime.set(floorDay(p.t), { time: floorDay(p.t) as UTCTimestamp, value: p.c });
    }
    const lastPrice = Math.max(...effective.map((p) => floorDay(p.t)));

    // Whitespace for event times not already present (lets future markers show).
    const markerTimes = new Map<number, MarketEvent[]>();
    for (const e of events) {
      const t = floorDay(Math.floor(Date.parse(e.scheduledAt) / 1000));
      if (!byTime.has(t)) byTime.set(t, { time: t as UTCTimestamp });
      const arr = markerTimes.get(t) ?? [];
      arr.push(e);
      markerTimes.set(t, arr);
    }

    const data = [...byTime.values()].sort(
      (a, b) => (a.time as number) - (b.time as number),
    );
    area.setData(data);

    const markers: SeriesMarker<Time>[] = [...markerTimes.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, evs]) => {
        const top = [...evs].sort((a, b) => b.expectedImpact - a.expectedImpact)[0];
        const meta = CATEGORY_META[top.category];
        return {
          time: t as UTCTimestamp,
          position: t > lastPrice ? "aboveBar" : "belowBar",
          color: meta.color,
          shape: top.isScheduled ? "circle" : "square",
          text: evs.length > 1 ? `${evs.length}` : top.title.slice(0, 14),
        };
      });
    area.setMarkers(markers);

    chart.timeScale().fitContent();

    // Click a marker → open the highest-impact event at that time.
    chart.subscribeClick((param) => {
      if (param.time == null) return;
      const evs = markerTimes.get(param.time as number);
      if (evs?.length) {
        onSelect([...evs].sort((a, b) => b.expectedImpact - a.expectedImpact)[0]);
      }
    });

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) chart.applyOptions({ width: w });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, effective]);

  if (effective.length === 0) {
    return (
      <p className="muted empty">
        Price series for {asset} isn't available yet. Crypto (BTC) loads live;
        other assets are published by the pipeline — check back after the next
        refresh.
      </p>
    );
  }

  return (
    <div className="asset-chart">
      <div className="asset-chart-canvas" ref={containerRef} />
      <p className="muted chart-note">
        {asset} price (last ~1y) · markers = our events (▢ = anticipated). Click a
        marker for details. Not financial advice.
      </p>
    </div>
  );
}
