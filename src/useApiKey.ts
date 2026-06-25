import { useCallback, useState } from "react";
import { DEFAULT_ASK_MODEL } from "./ask/anthropic";

// Bring-your-own-key storage for Ask-the-Ball (v3.6). The key never leaves the
// browser except in direct calls to api.anthropic.com.
const KEY = "cb-anthropic-key";
const MODEL = "cb-ask-model";

export function useApiKey() {
  const [apiKey, setKeyState] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [model, setModelState] = useState<string>(() => {
    try {
      return localStorage.getItem(MODEL) ?? DEFAULT_ASK_MODEL;
    } catch {
      return DEFAULT_ASK_MODEL;
    }
  });

  const setKey = useCallback((k: string) => {
    setKeyState(k);
    try {
      if (k) localStorage.setItem(KEY, k);
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const setModel = useCallback((m: string) => {
    setModelState(m);
    try {
      localStorage.setItem(MODEL, m);
    } catch {
      /* ignore */
    }
  }, []);

  const clearKey = useCallback(() => setKey(""), [setKey]);

  return { apiKey, setKey, clearKey, model, setModel };
}
