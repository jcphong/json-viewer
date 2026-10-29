import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditorPane } from "@/components/editor/EditorPane";
import { useViewerStore } from "@/store/useViewerStore";

import { stubLayout } from "./helpers/layout";

vi.mock("@/components/editor/JsonEditor", () => import("./fakes/FakeJsonEditor"));

const mode = (name: "Minify" | "Beautify" | "Object") => screen.getByRole("radio", { name });

async function renderPane() {
  const user = userEvent.setup();
  render(<EditorPane />);
  const editor = (await screen.findByLabelText("JSON editor")) as HTMLTextAreaElement;
  return { user, editor };
}

/** Pastes into the empty editor and waits for the debounced validation to finish. */
async function setup(
  initial: string,
  before?: (user: ReturnType<typeof userEvent.setup>) => Promise<void>,
) {
  const { user, editor } = await renderPane();
  await before?.(user);
  await user.click(editor);
  await user.paste(initial);
  await screen.findByText(/^(Valid|Invalid) JSON$/);
  return { user, editor };
}

describe("EditorPane", () => {
  beforeEach(() => {
    useViewerStore.setState({ stats: null });
  });

  it("offers Minify, Beautify and Object as a single choice, in that order", async () => {
    await renderPane();
    const group = screen.getByRole("radiogroup", { name: "View" });
    const options = screen.getAllByRole("radio");
    expect(group).toContainElement(options[0]);
    expect(options.map((o) => o.textContent)).toEqual(["Minify", "Beautify", "Object"]);
    expect(mode("Beautify")).toHaveAttribute("aria-checked", "true");
    expect(mode("Minify")).toHaveAttribute("aria-checked", "false");
  });

  it("beautifies JSON pasted into an empty editor (default mode)", async () => {
    const { editor } = await setup('{"a":[1,2]}');
    expect(editor.value).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(screen.getByText("Valid JSON")).toBeInTheDocument();
    expect(useViewerStore.getState().stats).toMatchObject({ nodeCount: 4 });
  });

  it("minifies pasted JSON when Minify is selected first, with wrapping on", async () => {
    const { editor } = await setup('{\n  "a": [1, 2]\n}', async (user) => {
      await user.click(mode("Minify"));
    });
    expect(editor.value).toBe('{"a":[1,2]}');
    expect(editor).toHaveAttribute("data-wrap", "true");
    expect(mode("Minify")).toHaveAttribute("aria-checked", "true");
  });

  it("switches between Minify and Beautify, keeping exact numbers", async () => {
    const { user, editor } = await setup('{"a":[1,2],"id":12345678901234567890}');
    await user.click(mode("Minify"));
    expect(editor.value).toBe('{"a":[1,2],"id":12345678901234567890}');
    expect(editor).toHaveAttribute("data-wrap", "true");
    expect(useViewerStore.getState().stats?.sizeBytes).toBe(editor.value.length);
    await user.click(mode("Beautify"));
    expect(editor.value).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "id": 12345678901234567890\n}');
    expect(editor).toHaveAttribute("data-wrap", "false");
    expect(mode("Beautify")).toHaveAttribute("aria-checked", "true");
  });

  it("re-applies the selected mode when it is clicked again", async () => {
    const { user, editor } = await setup("[1,2]");
    await user.type(editor, "{End}");
    await user.clear(editor);
    await user.paste("[3,   4]");
    // Not a first paste into an empty editor once typed into; wait for validation.
    await waitFor(() => expect(screen.getByText("Valid JSON")).toBeInTheDocument());
    await user.click(mode("Beautify"));
    expect(mode("Beautify")).toHaveAttribute("aria-checked", "true");
    expect(editor.value).toBe("[\n  3,\n  4\n]");
  });

  it("shows the error location and leaves the text untouched on invalid JSON", async () => {
    const { user, editor } = await setup('{\n  "a": 1,\n}');
    expect(editor.value).toBe('{\n  "a": 1,\n}');
    await user.click(mode("Minify"));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Line 3, column 1");
    expect(alert).toHaveTextContent("Quoted object key expected");
    expect(editor.value).toBe('{\n  "a": 1,\n}');
    expect(mode("Beautify")).toHaveAttribute("aria-checked", "true");
    expect(useViewerStore.getState().stats).toBeNull();
  });

  it("copies the document to the clipboard", async () => {
    const { user } = await setup("[1, 2]", async (u) => {
      await u.click(mode("Minify"));
    });
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: /^copy$/i }));
    expect(writeText).toHaveBeenCalledWith("[1,2]");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("shows the Object view and returns to the chosen text format", async () => {
    stubLayout();
    const { user, editor } = await setup('[{"_id":{"$oid":"6a9fdd120525594af2b1414c"},"n":1}]');
    await user.click(mode("Object"));
    expect(mode("Object")).toHaveAttribute("aria-checked", "true");
    expect(mode("Beautify")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("ObjectId('6a9fdd120525594af2b1414c')")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear/i })).toBeDisabled();
    await user.click(mode("Minify"));
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(mode("Minify")).toHaveAttribute("aria-checked", "true");
    expect(editor.value).toBe('[{"_id":{"$oid":"6a9fdd120525594af2b1414c"},"n":1}]');
  });

  it("disables Object while empty", async () => {
    await renderPane();
    expect(mode("Object")).toBeDisabled();
  });

  it("disables Object for invalid JSON", async () => {
    await setup("{oops");
    expect(mode("Object")).toBeDisabled();
  });

  it("clears the document", async () => {
    const { user, editor } = await setup("[1]");
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(editor.value).toBe("");
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(useViewerStore.getState().stats).toBeNull();
  });
});
