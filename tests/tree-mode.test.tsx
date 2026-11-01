import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { TEXT_VIEW_LIMIT } from "@/components/editor/EditorPane";
import { EXPAND_ALL_CONFIRM_NODES } from "@/components/tree/TreeToolbar";
import { useTreeStore } from "@/store/useTreeStore";
import { useViewerStore } from "@/store/useViewerStore";

import { stubLayout } from "./helpers/layout";

vi.mock("@/components/editor/JsonEditor", () => import("./fakes/FakeJsonEditor"));

const SAMPLE =
  '{"users":[{"name":"Ada","id":12345678901234567890},{"name":"Linh"}],"meta":{"ok":true}}';

const mode = (name: string) => screen.getByRole("radio", { name });
const tree = () => screen.getByRole("tree", { name: "JSON tree" });
const rowLabels = () =>
  within(tree())
    .queryAllByRole("treeitem")
    .map((r) => r.textContent);

async function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  const editor = (await screen.findByLabelText("JSON editor")) as HTMLTextAreaElement;
  return { user, editor };
}

async function pasteAndOpenTree(text: string) {
  const ctx = await renderApp();
  await ctx.user.click(ctx.editor);
  await ctx.user.paste(text);
  await screen.findByText("Valid JSON");
  await ctx.user.click(mode("Tree"));
  await waitFor(() => expect(rowLabels().length).toBeGreaterThan(0));
  return ctx;
}

/** A File that reports `size` (to exercise the big-file path without allocating 20 MB). */
function fileOfSize(text: string, name: string, size: number): File {
  const file = new File([text], name, { type: "application/json" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("Tree mode", () => {
  beforeAll(stubLayout);
  beforeEach(() => {
    useTreeStore.getState().reset();
    useViewerStore.setState({ stats: null });
  });

  it("shows the document as a tree with counts and exact numbers", async () => {
    const { user } = await pasteAndOpenTree(SAMPLE);
    expect(mode("Tree")).toHaveAttribute("aria-checked", "true");
    expect(rowLabels()).toEqual(["$:{2}", "users:[2]", "meta:{1}"]);
    await user.click(within(tree()).getAllByRole("button", { name: "Expand" })[0]);
    await waitFor(() => expect(rowLabels()).toContain("0:{2}"));
    await user.click(screen.getByRole("button", { name: "Expand 3 levels" }));
    await waitFor(() => expect(rowLabels()).toContain('name:"Ada"'));
    expect(rowLabels()).toContain("id:12345678901234567890");
  });

  it("collapses all and expands to a depth", async () => {
    const { user } = await pasteAndOpenTree(SAMPLE);
    await user.click(screen.getByRole("button", { name: "Expand all levels" }));
    await waitFor(() => expect(rowLabels()).toHaveLength(9));
    await user.click(screen.getByRole("button", { name: /collapse all/i }));
    await waitFor(() => expect(rowLabels()).toHaveLength(3));
    await user.click(screen.getByRole("button", { name: "Expand 2 levels" }));
    await waitFor(() =>
      expect(rowLabels()).toEqual(["$:{2}", "users:[2]", "0:{2}", "1:{1}", "meta:{1}", "ok:true"]),
    );
  });

  it("asks before expanding everything in a huge document", async () => {
    const huge = `[${"0,".repeat(EXPAND_ALL_CONFIRM_NODES)}0]`;
    const { user } = await pasteAndOpenTree(huge);
    await user.click(screen.getByRole("button", { name: "Expand all levels" }));
    const confirm = screen.getByRole("alert");
    expect(confirm).toHaveTextContent(/Expand all 500,002 rows\?/);
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the selected node's path, type, size and value, and copies them", async () => {
    const { user } = await pasteAndOpenTree(SAMPLE);
    await user.click(screen.getByRole("button", { name: "Expand 3 levels" }));
    await waitFor(() => expect(rowLabels()).toContain("id:12345678901234567890"));
    await user.click(screen.getByText("12345678901234567890"));
    const panel = await screen.findByRole("complementary", { name: "Selected value" });
    await waitFor(() => expect(panel).toHaveTextContent("$.users[0].id"));
    expect(panel).toHaveTextContent("number");
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(within(panel).getByRole("button", { name: "Copy path" }));
    expect(writeText).toHaveBeenLastCalledWith("$.users[0].id");
    await user.click(screen.getByText("users"));
    await waitFor(() => expect(panel).toHaveTextContent("$.users"));
    await user.click(within(panel).getByRole("button", { name: "Copy value" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith(
        '[{"name":"Ada","id":12345678901234567890},{"name":"Linh"}]',
      ),
    );
  });

  it("disables Tree for invalid JSON", async () => {
    const { user, editor } = await renderApp();
    await user.click(editor);
    await user.paste("{oops");
    await screen.findByText("Invalid JSON");
    expect(mode("Tree")).toBeDisabled();
  });
});

describe("Opening documents", () => {
  beforeAll(stubLayout);
  beforeEach(() => {
    useTreeStore.getState().reset();
    useViewerStore.setState({ stats: null });
  });

  it("opens a file from the file picker into the editor, named in the status bar", async () => {
    const { user, editor } = await renderApp();
    const input = screen.getByLabelText("Open JSON file");
    await user.upload(input, new File(['{"a":1}'], "config.json", { type: "application/json" }));
    await waitFor(() => expect(editor.value).toBe('{\n  "a": 1\n}'));
    expect(screen.getByRole("contentinfo")).toHaveTextContent("config.json");
  });

  it("opens files over the text limit straight into Tree mode", async () => {
    const { user, editor } = await renderApp();
    const big = fileOfSize(SAMPLE, "big-50mb.json", TEXT_VIEW_LIMIT + 1);
    await user.upload(screen.getByLabelText("Open JSON file"), big);
    await waitFor(() => expect(rowLabels()).toEqual(["$:{2}", "users:[2]", "meta:{1}"]));
    expect(mode("Tree")).toHaveAttribute("aria-checked", "true");
    expect(mode("Minify")).toBeDisabled();
    expect(mode("Beautify")).toBeDisabled();
    expect(mode("Object")).toBeDisabled();
    expect(screen.getByText(/Tree only/)).toBeInTheDocument();
    expect(editor.value).toBe("");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("big-50mb.json");
    await user.click(screen.getByRole("button", { name: /clear/i }));
    await waitFor(() => expect(mode("Beautify")).toBeEnabled());
    expect(mode("Beautify")).toHaveAttribute("aria-checked", "true");
  });

  it("shows the parse error for an invalid big file", async () => {
    const { user } = await renderApp();
    await user.upload(
      screen.getByLabelText("Open JSON file"),
      fileOfSize('{"a":1,}', "broken.json", TEXT_VIEW_LIMIT + 1),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Line 1, column 8");
    expect(screen.getByText("Invalid JSON")).toBeInTheDocument();
  });

  it("pastes into the editor from anywhere on the page", async () => {
    const { editor } = await renderApp();
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: (type: string) => (type === "text/plain" ? "[1,2]" : "") },
    });
    act(() => {
      document.body.dispatchEvent(event);
    });
    await waitFor(() => expect(editor.value).toBe("[\n  1,\n  2\n]"));
    expect(event.defaultPrevented).toBe(true);
  });
});
