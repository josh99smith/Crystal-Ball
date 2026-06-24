import { useEffect, useMemo, useRef, useState } from "react";
import type { MarketEvent, TimelineScaleId } from "../../shared/schema";
import { CATEGORY_META } from "../../shared/categories";
import {
  clampDomain,
  cyclicalMarkers,
  makeTicks,
} from "../timelineScale";
import { OutcomeFan } from "./Outcomes";

interface Props {
  events: MarketEvent[]; // asset-filtered, not time-filtered
  scale: TimelineScaleId;
  horizonDays: number;
  selectedAssets: Set<string>;
  selectedEventId: string | null;
  onSelect: (event: MarketEvent) => void;
}

const DAY = 24 * 60 * 60 * 1000;
const HEIGHT = 200;
const AXIS_Y = 150; // baseline for nodes
const CLUSTER_PX = 22;

interface Positioned {
  event: MarketEvent;
  x: number;
}
interface Cluster {
  x: number;
  items: Positioned[];
}

export function Timeline({
  events,
  scale,
  horizonDays,
  selectedAssets,
  selectedEventId,
  onSelect,
}: Props) {
  const now = useMemo(() => Date.now(), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [domain, setDomain] = useState<[number, number]>([
    now,
    now + horizonDays * DAY,
  ]);

  // Reset the view window when the scale preset changes.
  useEffect(() => {
    setDomain(clampDomain(now, now + horizonDays * DAY, now));
  }, [scale, horizonDays, now]);

  // Responsive width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel-to-zoom (non-passive so we can preventDefault).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      setDomain(([s, eEnd]) => {
        const frac = width > 0 ? px / width : 0.5;
        const cursor = s + (eEnd - s) * frac;
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        return clampDomain(
          cursor - (cursor - s) * factor,
          cursor + (eEnd - cursor) * factor,
          now,
        );
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [width, now]);

  // Drag-to-pan.
  const drag = useRef<{ x: number; domain: [number, number] } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, domain };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || width <= 0) return;
    const [s, eEnd] = drag.current.domain;
    const dt = ((e.clientX - drag.current.x) / width) * (eEnd - s);
    setDomain(clampDomain(s - dt, eEnd - dt, now));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const [start, end] = domain;
  const xOf = (t: number) => ((t - start) / (end - start)) * width;

  const ticks = useMemo(() => makeTicks(start, end), [start, end]);
  const markers = useMemo(() => cyclicalMarkers(start, end), [start, end]);

  // Position + cluster events within the window.
  const clusters = useMemo<Cluster[]>(() => {
    const visible = events
      .filter((e) => {
        const t = Date.parse(e.scheduledAt);
        return t >= start && t <= end;
      })
      .map((e) => ({ event: e, x: xOf(Date.parse(e.scheduledAt)) }))
      .sort((a, b) => a.x - b.x);

    const out: Cluster[] = [];
    for (const p of visible) {
      const last = out[out.length - 1];
      if (last && p.x - last.x < CLUSTER_PX) {
        last.items.push(p);
        last.x = last.items.reduce((s, i) => s + i.x, 0) / last.items.length;
      } else {
        out.push({ x: p.x, items: [p] });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, start, end, width]);

  const totalVisible = clusters.reduce((s, c) => s + c.items.length, 0);
  const nowX = xOf(now);

  return (
    <div className="tl">
      <div
        className="tl-canvas"
        ref={containerRef}
        style={{ height: HEIGHT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {/* axis baseline */}
        <div className="tl-axis" style={{ top: AXIS_Y }} />

        {/* cyclical markers */}
        {markers.map((m, i) => (
          <div key={`m${i}`} className={`tl-marker ${m.kind}`} style={{ left: xOf(m.time) }}>
            <span className="tl-marker-label">{m.label}</span>
          </div>
        ))}

        {/* ticks */}
        {ticks.map((t, i) => (
          <div key={`t${i}`} className="tl-tick" style={{ left: xOf(t.time), top: 0, height: AXIS_Y }}>
            <span className="tl-tick-label" style={{ top: AXIS_Y + 6 }}>
              {t.label}
            </span>
          </div>
        ))}

        {/* now line */}
        {nowX >= 0 && nowX <= width && (
          <div className="tl-now" style={{ left: nowX, height: AXIS_Y }}>
            <span className="tl-now-label">now</span>
          </div>
        )}

        {/* events / clusters */}
        {clusters.map((c, i) => {
          if (c.items.length === 1) {
            const { event } = c.items[0];
            const meta = CATEGORY_META[event.category];
            const hit =
              selectedAssets.size > 0 &&
              event.links.some((l) => selectedAssets.has(l.asset));
            const size = 11 + event.expectedImpact * 13;
            return (
              <button
                key={event.id}
                className={
                  "tl-node" +
                  (selectedEventId === event.id ? " selected" : "") +
                  (hit ? " hit" : "") +
                  (event.isScheduled ? "" : " anticipated")
                }
                style={{
                  left: c.x,
                  top: AXIS_Y,
                  width: size,
                  height: size,
                  ["--node-color" as string]: meta.color,
                }}
                title={`${event.title} · ${meta.label} · ${new Date(event.scheduledAt).toLocaleDateString()}`}
                onClick={() => onSelect(event)}
              >
                {selectedEventId === event.id && (
                  <span className="tl-node-label">{event.title}</span>
                )}
              </button>
            );
          }
          // cluster pill
          return (
            <button
              key={`c${i}`}
              className="tl-cluster"
              style={{ left: c.x, top: AXIS_Y }}
              title={`${c.items.length} events — click to zoom in`}
              onClick={() => {
                const times = c.items.map((it) => Date.parse(it.event.scheduledAt));
                const pad = (Math.max(...times) - Math.min(...times)) * 0.5 + DAY;
                setDomain(clampDomain(Math.min(...times) - pad, Math.max(...times) + pad, now));
              }}
            >
              {c.items.length}
            </button>
          );
        })}

        {/* selected outcome fan */}
        {clusters.flatMap((c) =>
          c.items
            .filter((p) => p.event.id === selectedEventId && p.event.outcomes?.length)
            .map((p) => (
              <div key={`fan-${p.event.id}`} className="tl-fan" style={{ left: c.x, top: AXIS_Y + 24 }}>
                <OutcomeFan outcomes={p.event.outcomes!} selected={selectedAssets} />
              </div>
            )),
        )}
      </div>

      <div className="tl-hint muted">
        {totalVisible} of {events.length} events in view · scroll to zoom, drag to
        pan, click a number to expand a cluster
      </div>
    </div>
  );
}
