import type { MarketEvent } from "../../shared/schema";
import { structuralLinksFor } from "../correlation/structural";
import type { EventProvider, FetchWindow } from "./types";

/**
 * Lunar-phase provider — computed (keyless). Emits new-moon and full-moon events
 * from the synodic cycle. Lunar market effects are folklore with weak evidence;
 * this exists so the historical event study and calibration loop can put a real
 * number on it. Treated like any other event — the data decides, not belief.
 */

const SYNODIC = 29.530588853; // days between new moons
const NEW_MOON_EPOCH_JD = 2451550.09766; // reference new moon (2000-01-06)
const JD_UNIX = 2440587.5;

function jdToDate(jd: number): Date {
  return new Date((jd - JD_UNIX) * 86400000);
}
function dateToJd(d: Date): number {
  return d.getTime() / 86400000 + JD_UNIX;
}

/** New & full moon datetimes within [from, to]. */
function moonPhases(from: Date, to: Date): { newMoons: Date[]; fullMoons: Date[] } {
  const kStart = Math.floor((dateToJd(from) - NEW_MOON_EPOCH_JD) / SYNODIC) - 1;
  const kEnd = Math.ceil((dateToJd(to) - NEW_MOON_EPOCH_JD) / SYNODIC) + 1;
  const newMoons: Date[] = [];
  const fullMoons: Date[] = [];
  for (let k = kStart; k <= kEnd; k++) {
    const nm = jdToDate(NEW_MOON_EPOCH_JD + SYNODIC * k);
    const fm = jdToDate(NEW_MOON_EPOCH_JD + SYNODIC * k + SYNODIC / 2);
    if (nm >= from && nm <= to) newMoons.push(nm);
    if (fm >= from && fm <= to) fullMoons.push(fm);
  }
  return newMoons.length || fullMoons.length ? { newMoons, fullMoons } : { newMoons, fullMoons };
}

/** Past phase dates (YYYY-MM-DD) for a lunar kind, for the event study. */
export function lunarPastDates(kind: string, from: Date, to: Date): string[] {
  const { newMoons, fullMoons } = moonPhases(from, to);
  const list = kind === "lunar-full" ? fullMoons : kind === "lunar-new" ? newMoons : [];
  return list.map((d) => d.toISOString().slice(0, 10));
}

export class LunarProvider implements EventProvider {
  id = "lunar";

  isConfigured(): boolean {
    return true; // computed
  }

  async fetchEvents(window: FetchWindow): Promise<MarketEvent[]> {
    const { newMoons, fullMoons } = moonPhases(window.from, window.to);
    const make = (when: Date, kind: "lunar-new" | "lunar-full", title: string): MarketEvent => ({
      id: `${kind}-${when.toISOString().slice(0, 10)}`,
      title,
      category: "lunar",
      scheduledAt: when.toISOString(),
      isScheduled: true,
      expectedImpact: 0.25, // folklore — kept low
      source: this.id,
      links: structuralLinksFor(kind),
    });
    return [
      ...newMoons.map((d) => make(d, "lunar-new", "New moon")),
      ...fullMoons.map((d) => make(d, "lunar-full", "Full moon")),
    ];
  }
}
