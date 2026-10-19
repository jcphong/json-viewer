import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parse } from "lossless-json";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { DocumentView } from "@/components/documents/DocumentView";

import { stubLayout } from "./helpers/layout";

beforeAll(stubLayout);

const longContext =
  'Các bình luận tập trung tranh luận sâu về khái niệm "bần nông" trong bối cảnh lịch sử';

const sample = parse(`[
  {
    "_id": {"$oid": "6a9fdd120525594af2b1414c"},
    "context_hash": "957aa36b9c04bdee1af19521f9b58dd4",
    "context": ${JSON.stringify(longContext)},
    "dbscan_label": 0,
    "n_items": 19,
    "prefix": "cluster_contexts",
    "sampled_texts": ["a", "b", "c"],
    "meta": {"created": {"$date": "2024-03-01T10:00:00Z"}, "score": 1.10}
  },
  {"_id": {"$oid": "6a9fdd120525594af2b1414d"}, "n_items": 2}
]`);

describe("DocumentView", () => {
  it("renders one card per document with a count", () => {
    render(<DocumentView root={sample} />);
    expect(screen.getByText("2 documents")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("shows Compass-style field values", () => {
    render(<DocumentView root={sample} />);
    const card = screen.getByRole("article", { name: "Document 1" });
    expect(within(card).getByText("ObjectId('6a9fdd120525594af2b1414c')")).toBeInTheDocument();
    expect(within(card).getByText('"957aa36b9c04bdee1af19521f9b58dd4"')).toBeInTheDocument();
    expect(within(card).getByText("Array (3)")).toBeInTheDocument();
    expect(within(card).getByText("Object")).toBeInTheDocument();
    expect(within(card).getByText("19")).toBeInTheDocument();
  });

  it("expands arrays and nested objects on click", async () => {
    const user = userEvent.setup();
    render(<DocumentView root={sample} />);
    const card = screen.getByRole("article", { name: "Document 1" });
    await user.click(within(card).getByRole("button", { name: "Expand sampled_texts" }));
    expect(within(card).getByText('"b"')).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Expand meta" }));
    expect(within(card).getByText("2024-03-01T10:00:00.000+00:00")).toBeInTheDocument();
    expect(within(card).getByText("1.10")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Collapse sampled_texts" }));
    expect(within(card).queryByText('"b"')).not.toBeInTheDocument();
  });

  it("toggles long strings between one line and full text", async () => {
    const user = userEvent.setup();
    render(<DocumentView root={sample} />);
    const value = screen.getByTitle(/Click to show all/);
    expect(value).toHaveClass("truncate");
    await user.click(value);
    expect(screen.getByTitle("Click to collapse")).toHaveClass("whitespace-pre-wrap");
  });

  it("pages very large arrays", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 250 }, (_, i) => `"v${i}"`).join(",");
    const big = parse(`{"embedding":[${items}]}`);
    render(<DocumentView root={big} />);
    expect(screen.getByText("1 document")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand embedding" }));
    expect(screen.getByText('"v99"')).toBeInTheDocument();
    expect(screen.queryByText('"v100"')).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Show 100 more \(150 hidden\)/ }));
    expect(screen.getByText('"v199"')).toBeInTheDocument();
    expect(screen.queryByText('"v200"')).not.toBeInTheDocument();
  });

  it("shows a non-object root as a single value", () => {
    render(<DocumentView root={parse('"just a string"')} />);
    expect(screen.getByText('"just a string"')).toBeInTheDocument();
  });

  it("copies a document as formatted JSON, keeping exact numbers", async () => {
    const user = userEvent.setup();
    render(<DocumentView root={sample} />);
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: "Copy document 2" }));
    expect(writeText).toHaveBeenCalledWith(
      '{\n  "_id": {\n    "$oid": "6a9fdd120525594af2b1414d"\n  },\n  "n_items": 2\n}',
    );
  });
});
