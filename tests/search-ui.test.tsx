import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { INITIAL_SEARCH, useTreeStore } from "@/store/useTreeStore";
import { useViewerStore } from "@/store/useViewerStore";

import { stubLayout } from "./helpers/layout";

vi.mock("@/components/editor/JsonEditor", () => import("./fakes/FakeJsonEditor"));

const DOC = JSON.stringify({
  users: [
    { name: "Ada", email: "ada@example.com", role: "admin" },
    { name: "Linh", email: "linh@example.com", role: "editor" },
    { name: "Omar", email: "omar@example.com", role: "admin" },
  ],
  admin: { enabled: true },
});

const panel = () => screen.getByRole("complementary", { name: "Selected value" });

async function openTreeWith(text: string) {
  const user = userEvent.setup();
  render(<App />);
  const editor = await screen.findByLabelText("JSON editor");
  await user.click(editor);
  await user.paste(text);
  await screen.findByText("Valid JSON");
  await user.click(screen.getByRole("radio", { name: "Tree" }));
  await screen.findAllByRole("treeitem");
  return user;
}

const pressFind = () =>
  act(() => {
    fireEvent.keyDown(window, { key: "f", metaKey: true });
  });

describe("Search", () => {
  beforeAll(stubLayout);
  beforeEach(() => {
    useTreeStore.getState().reset();
    useTreeStore.setState({ searchOpen: false, search: INITIAL_SEARCH });
    useViewerStore.setState({ stats: null });
  });

  it("opens with ⌘F, finds matches, reveals and selects the first", async () => {
    const user = await openTreeWith(DOC);
    pressFind();
    const box = await screen.findByRole("searchbox", { name: "Search" });
    await user.type(box, "admin");
    expect(await screen.findByText("1 of 3")).toBeInTheDocument();
    // The first match is $.users[0].role, revealed inside a collapsed array and selected.
    await waitFor(() => expect(panel()).toHaveTextContent("$.users[0].role"));
    const marks = screen.getAllByText("admin", { selector: "mark" });
    expect(marks.length).toBeGreaterThan(0);
  });

  it("steps with Enter and Shift+Enter, wrapping around", async () => {
    const user = await openTreeWith(DOC);
    pressFind();
    const box = await screen.findByRole("searchbox", { name: "Search" });
    await user.type(box, "admin");
    await screen.findByText("1 of 3");
    await user.keyboard("{Enter}");
    await screen.findByText("2 of 3");
    await waitFor(() => expect(panel()).toHaveTextContent("$.users[2].role"));
    await user.keyboard("{Shift>}{Enter}{/Shift}{Shift>}{Enter}{/Shift}");
    await screen.findByText("3 of 3");
    await waitFor(() => expect(panel()).toHaveTextContent(/^Path\$\.admin/));
  });

  it("advances once per Enter, even when pressed rapidly", async () => {
    const user = await openTreeWith(DOC);
    pressFind();
    await user.type(await screen.findByRole("searchbox", { name: "Search" }), "admin");
    await screen.findByText("1 of 3");
    await user.keyboard("{Enter}{Enter}");
    expect(await screen.findByText("3 of 3")).toBeInTheDocument();
    await waitFor(() => expect(panel()).toHaveTextContent(/^Path\$\.admin/));
  });

  it("limits the search to keys or values", async () => {
    const user = await openTreeWith(DOC);
    pressFind();
    await user.type(await screen.findByRole("searchbox", { name: "Search" }), "admin");
    await screen.findByText("1 of 3");
    const scope = screen.getByRole("radiogroup", { name: "Search in" });
    await user.click(within(scope).getByRole("radio", { name: "Keys" }));
    expect(await screen.findByText("1 of 1")).toBeInTheDocument();
    await user.click(within(scope).getByRole("radio", { name: "Values" }));
    expect(await screen.findByText("1 of 2")).toBeInTheDocument();
  });

  it("matches case and regular expressions on request", async () => {
    const user = await openTreeWith(DOC);
    pressFind();
    const box = await screen.findByRole("searchbox", { name: "Search" });
    await user.type(box, "ADA");
    await screen.findByText("1 of 2");
    await user.click(screen.getByRole("button", { name: "Match case" }));
    expect(await screen.findByText("No matches")).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "^(ada|omar)@");
    await user.click(screen.getByRole("button", { name: "Regular expression" }));
    await user.click(screen.getByRole("button", { name: "Match case" }));
    expect(await screen.findByText("1 of 2")).toBeInTheDocument();
    await user.type(box, "(");
    expect(await screen.findByText("Invalid regular expression")).toBeInTheDocument();
  });

  it("closes with Escape and clears highlights", async () => {
    const user = await openTreeWith(DOC);
    pressFind();
    await user.type(await screen.findByRole("searchbox", { name: "Search" }), "admin");
    await screen.findByText("1 of 3");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("searchbox", { name: "Search" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryAllByText("admin", { selector: "mark" })).toHaveLength(0),
    );
  });

  it("⌘K from the editor switches to Tree and opens search", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByLabelText("JSON editor"));
    await user.paste(DOC);
    await screen.findByText("Valid JSON");
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    expect(await screen.findByRole("searchbox", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Tree" })).toHaveAttribute("aria-checked", "true");
  });
});
