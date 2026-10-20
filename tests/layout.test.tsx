import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { useThemeStore } from "@/store/useThemeStore";
import { useViewerStore } from "@/store/useViewerStore";

vi.mock("@/components/editor/JsonEditor", () => import("./fakes/FakeJsonEditor"));

describe("App layout", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "system" });
    useViewerStore.setState({ stats: null });
  });

  it("renders toolbar, main pane, and status bar", () => {
    render(<App />);
    expect(screen.getByRole("banner")).toHaveTextContent("JSON Viewer");
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Beautify" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("No document loaded");
  });

  it("shows document stats in the status bar", () => {
    render(<App />);
    act(() => {
      useViewerStore.getState().setStats({
        fileName: "big-50mb.json",
        sizeBytes: 52428800,
        nodeCount: 1234567,
        parseMs: 2150,
      });
    });
    const status = screen.getByRole("contentinfo");
    expect(status).toHaveTextContent("big-50mb.json");
    expect(status).toHaveTextContent("50.0 MB");
    expect(status).toHaveTextContent("1,234,567 nodes");
    expect(status).toHaveTextContent("parsed in 2.15 s");
  });

  it("theme toggle cycles and updates the <html> class", async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole("button", { name: /theme: system/i });
    await user.click(toggle);
    expect(screen.getByRole("button", { name: /theme: light/i })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("light");
    await user.click(screen.getByRole("button", { name: /theme: light/i }));
    expect(document.documentElement).toHaveClass("dark");
  });
});
