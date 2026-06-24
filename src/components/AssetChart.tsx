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
import type { PastMarker } from "../usePastEvents";

interface Props {
  asset: string;
  series: Array<{ t: number; c: number }>;
  events: MarketEvent[]; // future events linked to this asset
  pastMarkers: PastMarker[]; // past occurrences (all assets)
  onSelect: (event: MarketEvent) => void;
}

const DAY = 86400;
const floorDay = (sec: number) => Math.floor(sec / DAY) * DAY;
const COINGECKO_ID: Record<string, string> = { BTC: "bitcoin" };

interface MarkerInfo {
  category: MarketEvent["category"];
  title: string;
  scheduled: boolean;
  event?: MarketEvent; // present for future events (click → detail)
}

export function AssetChart({ asset, series, events, pastMarkers, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
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
    const firstTime = Math.min(...effective.map((p) => floorDay(p.t)));
    const lastPrice = Math.max(...effective.map((p) => floorDay(p.t)));

    // Collect markers: past occurrences (for this asset) + future events.
    const atTime = new Map<number, MarkerInfo[]>();
    const add = (sec: number, info: MarkerInfo) => {
      const t = floorDay(sec);
      const arr = atTime.get(t) ?? [];
      arr.push(info);
      atTime.set(t, arr);
    };
    for (const m of pastMarkers) {
      if (m.assets.includes(asset)) {
        add(m.t, { category: m.category, title: m.title, scheduled: m.scheduled });
      }
    }
    for (const e of events) {
      add(Math.floor(Date.parse(e.scheduledAt) / 1000), {
        category: e.category,
        title: e.title,
        scheduled: e.isScheduled,
        event: e,
      });
    }

    // Whitespace so markers outside the price range still render.
    for (const t of atTime.keys()) if (!byTime.has(t)) byTime.set(t, { time: t as UTCTimestamp });

    area.setData(
      [...byTime.values()].sort((a, b) => (a.time as number) - (b.time as number)),
    );

    const markers: SeriesMarker<Time>[] = [...atTime.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, infos]) => {
        const top = [...infos].sort(
          (a, b) => (b.event?.expectedImpact ?? 0.4) - (a.event?.expectedImpact ?? 0.4),
        )[0];
        const meta = CATEGORY_META[top.category];
        return {
          time: t as UTCTimestamp,
          position: t > lastPrice ? "aboveBar" : "belowBar",
          color: meta.color,
          shape: top.scheduled ? "circle" : "square",
          text: infos.length > 1 ? `${infos.length}` : top.title.slice(0, 12),
        };
      });
    area.setMarkers(markers);

    // Show ~1y of history + ~4 months forward so events fan out either side.
    const nowDay = floorDay(Date.now() / 1000);
    chart.timeScale().setVisibleRange({
      from: firstTime as UTCTimestamp,
      to: (nowDay + 120 * DAY) as UTCTimestamp,
    });

    chart.subscribeClick((param) => {
      if (param.time == null) return;
      const infos = atTime.get(param.time as number);
      const ev = infos?.map((i) => i.event).filter(Boolean)[0];
      if (ev) onSelect(ev);
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
  }, [asset, effective, events, pastMarkers]);

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
        {asset} price (~1y) · markers = our events, past &amp; future (▢ =
        anticipated). Scroll/drag to explore; click a future marker for details.
      </p>
    </div>
  );
}
