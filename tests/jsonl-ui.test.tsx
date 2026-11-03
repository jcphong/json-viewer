import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { TEXT_VIEW_LIMIT } from "@/components/editor/EditorPane";
import { useTreeStore } from "@/store/useTreeStore";
import { useViewerStore } from "@/store/useViewerStore";

import { stubLayout } from "./helpers/layout";

vi.mock("@/components/editor/JsonEditor", () => import("./fakes/FakeJsonEditor"));

const JSONL = '{"id":1,"name":"Ada"}\n{"id":2,"name":"Linh"}\n{"id":3, oops}\n{"id":4}';

const mode = (name: string) => screen.getByRole("radio", { name });
const rowLabels = () =>
  within(screen.getByRole("tree", { name: "JSON tree" }))
    .queryAllByRole("treeitem")
    .map((r) => r.textContent);

async function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  const editor = (await screen.findByLabelText("JSON editor")) as HTMLTextAreaElement;
  return { user, editor };
}

function fileOfSize(text: string, name: string, size: number): File {
  const file = new File([text], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("JSON Lines", () => {
  beforeAll(stubLayout);
  beforeEach(() => {
    useTreeStore.getState().reset();
    useViewerStore.setState({ stats: null });
  });

  it("detects pasted JSON Lines and shows each line in the tree", async () => {
    const { user, editor } = await renderApp();
    await user.click(editor);
    await user.paste(JSONL);
    const badge = await screen.findByText(/JSONL · 4 lines/);
    expect(badge).toHaveTextContent("· 1 malformed");
    await waitFor(() => expect(mode("Tree")).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(rowLabels()).toEqual(["$:[3]", "#1:{2}", "#2:{2}", "#4:{1}"]));
    expect(mode("Beautify")).toBeDisabled();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("4 lines (1 malformed)");
  });

  it("lists malformed lines without failing the load", async () => {
    const { user, editor } = await renderApp();
    await user.click(editor);
    await user.paste(JSONL);
    const panel = await screen.findByRole("group", { name: "Malformed lines" });
    expect(panel).toHaveTextContent("1 malformed line skipped");
    expect(panel).toHaveTextContent("Line 3, column 10");
  });

  it("shows the side panel's line number and a path relative to the line", async () => {
    const { user, editor } = await renderApp();
    await user.click(editor);
    await user.paste(JSONL);
    await waitFor(() => expect(rowLabels()).toContain("#2:{2}"));
    await user.click(screen.getByRole("button", { name: "Expand 2 levels" }));
    await waitFor(() => expect(rowLabels()).toContain('name:"Linh"'));
    await user.click(screen.getByText('"Linh"'));
    const side = await screen.findByRole("complementary", { name: "Selected value" });
    await waitFor(() => expect(side).toHaveTextContent("$.name"));
    expect(side).toHaveTextContent(/Line\s*2/);
  });

  it("shows JSON Lines as documents in the Object view and minifies line by line", async () => {
    const { user, editor } = await renderApp();
    await user.click(editor);
    await user.paste('{ "id" : 1 }\n{ "id" : 2 }');
    await screen.findByText(/JSONL · 2 lines/);
    await user.click(mode("Object"));
    expect(await screen.findByText("2 documents")).toBeInTheDocument();
    await user.click(mode("Minify"));
    await waitFor(() => expect(editor.value).toBe('{"id":1}\n{"id":2}'));
  });

  it("opens a big .jsonl file in the tree and can switch it to JSON", async () => {
    const { user } = await renderApp();
    await user.upload(
      screen.getByLabelText("Open JSON file"),
      fileOfSize(JSONL, "events.jsonl", TEXT_VIEW_LIMIT + 1),
    );
    await waitFor(() => expect(rowLabels()).toEqual(["$:[3]", "#1:{2}", "#2:{2}", "#4:{1}"]));
    expect(screen.getByText(/JSONL · 4 lines/)).toBeInTheDocument();
    const readAs = screen.getByRole("radiogroup", { name: "Read as" });
    await user.click(within(readAs).getByRole("radio", { name: "JSON" }));
    expect(await screen.findByText("Read as JSONL")).toBeInTheDocument();
    expect(screen.getByText("Invalid JSON")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Read as JSONL" }));
    await waitFor(() => expect(rowLabels()).toContain("#4:{1}"));
  });
});
