import { useEffect, useState } from "react";
import type { DataBundle } from "../shared/schema";

type State =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; bundle: DataBundle };

/** Loads the precomputed data bundle published by the pipeline. */
export function useDataBundle(): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}data/events.json`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<DataBundle>;
      })
      .then((bundle) => setState({ status: "ready", bundle }))
      .catch((err: Error) => setState({ status: "error", error: err.message }));
  }, []);

  return state;
}
