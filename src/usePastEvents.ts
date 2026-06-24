import { useEffect, useState } from "react";
import type { EventCategory } from "../shared/schema";

/** Slim past-event marker published by the pipeline (data/past-events.json). */
export interface PastMarker {
  t: number; // unix seconds
  category: EventCategory;
  title: string;
  assets: string[];
  scheduled: boolean;
}

export function usePastEvents(): PastMarker[] {
  const [past, setPast] = useState<PastMarker[]>([]);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/past-events.json`)
      .then((res) => (res.ok ? (res.json() as Promise<PastMarker[]>) : []))
      .then(setPast)
      .catch(() => setPast([]));
  }, []);
  return past;
}
