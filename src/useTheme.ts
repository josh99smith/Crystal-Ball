import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

function initialTheme(): Theme {
  try {
    const s = localStorage.getItem("cb-theme");
    if (s === "light" || s === "dark") return s;
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  } catch {
    /* ignore */
  }
  return "dark";
}

/** Theme state applied via [data-theme] on <html>, persisted to localStorage. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("cb-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
