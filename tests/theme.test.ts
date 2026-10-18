import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyTheme, THEME_STORAGE_KEY, useThemeStore } from "@/store/useThemeStore";

function mockSystemDark(dark: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: dark,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

describe("theme store", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "system" });
    document.documentElement.className = "";
    mockSystemDark(false);
  });

  it("cycles system → light → dark → system", () => {
    const { cycleTheme } = useThemeStore.getState();
    cycleTheme();
    expect(useThemeStore.getState().theme).toBe("light");
    cycleTheme();
    expect(useThemeStore.getState().theme).toBe("dark");
    cycleTheme();
    expect(useThemeStore.getState().theme).toBe("system");
  });

  it("persists explicit choices and clears storage for system", () => {
    const { setTheme } = useThemeStore.getState();
    setTheme("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    setTheme("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("applies the system preference in system mode", () => {
    mockSystemDark(true);
    applyTheme("system");
    expect(document.documentElement).toHaveClass("dark");
    mockSystemDark(false);
    applyTheme("system");
    expect(document.documentElement).toHaveClass("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("explicit choice overrides the system preference", () => {
    mockSystemDark(true);
    applyTheme("light");
    expect(document.documentElement).toHaveClass("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
