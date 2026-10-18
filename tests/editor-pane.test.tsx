import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditorPane } from "@/components/editor/EditorPane";
import { useViewerStore } from "@/store/useViewerStore";

vi.mock("@/components/editor/JsonEditor", () => import("./fakes/FakeJsonEditor"));

async function setup(initial: string) {
  const user = userEvent.setup();
  render(<EditorPane />);
  const editor = (await screen.findByLabelText("JSON editor")) as HTMLTextAreaElement;
  await user.click(editor);
  await user.paste(initial);
  // Validation is debounced; actions enable once it has run.
  await waitFor(() => expect(screen.getByRole("button", { name: /beautify/i })).toBeEnabled());
  return { user, editor };
}

describe("EditorPane", () => {
  beforeEach(() => {
    useViewerStore.setState({ stats: null });
  });

  it("disables actions while empty", async () => {
    render(<EditorPane />);
    await screen.findByLabelText("JSON editor");
    expect(screen.getByRole("button", { name: /beautify/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /minify/i })).toBeDisabled();
  });

  it("validates pasted JSON and updates the status bar stats", async () => {
    await setup('{"a":[1,2]}');
    expect(await screen.findByText("Valid JSON")).toBeInTheDocument();
    expect(useViewerStore.getState().stats).toMatchObject({ sizeBytes: 11, nodeCount: 4 });
  });

  it("beautifies and minifies", async () => {
    const { user, editor } = await setup('{"a":[1,2],"id":12345678901234567890}');
    await user.click(await screen.findByRole("button", { name: /beautify/i }));
    expect(editor.value).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "id": 12345678901234567890\n}');
    await user.click(screen.getByRole("button", { name: /minify/i }));
    expect(editor.value).toBe('{"a":[1,2],"id":12345678901234567890}');
    expect(useViewerStore.getState().stats?.sizeBytes).toBe(editor.value.length);
  });

  it("shows the error location and leaves the text untouched on invalid JSON", async () => {
    const { user, editor } = await setup('{\n  "a": 1,\n}');
    await user.click(await screen.findByRole("button", { name: /beautify/i }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Line 3, column 1");
    expect(alert).toHaveTextContent("Quoted object key expected");
    expect(editor.value).toBe('{\n  "a": 1,\n}');
    expect(screen.getByText("Invalid JSON")).toBeInTheDocument();
    expect(useViewerStore.getState().stats).toBeNull();
  });

  it("copies the document to the clipboard", async () => {
    const { user } = await setup("[1, 2]");
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(await screen.findByRole("button", { name: /^copy$/i }));
    expect(writeText).toHaveBeenCalledWith("[1, 2]");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("clears the document", async () => {
    const { user, editor } = await setup("[1]");
    await user.click(await screen.findByRole("button", { name: /clear/i }));
    expect(editor.value).toBe("");
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(useViewerStore.getState().stats).toBeNull();
  });
});
