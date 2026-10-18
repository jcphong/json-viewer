import { create } from "zustand";

export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

// Keep in sync with the pre-paint script in index.html.
export const THEME_STORAGE_KEY = "json-viewer:theme";
const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
const THEME_ORDER: Theme[] = ["system", "light", "dark"];

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEME_ORDER as string[]).includes(value);
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function writeStoredTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the theme still applies for this session.
  }
}

export function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolved = resolveTheme(theme);
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
}

/** Re-applies the theme whenever the OS preference changes while in "system" mode. */
export function watchSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(COLOR_SCHEME_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    writeStoredTheme(theme);
    set({ theme });
  },
  cycleTheme: () => {
    const current = THEME_ORDER.indexOf(get().theme);
    get().setTheme(THEME_ORDER[(current + 1) % THEME_ORDER.length]);
  },
}));
