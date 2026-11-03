/**
 * The document model that runs inside the parser worker (PLAN.md §3).
 * It owns the text and its node index; the UI only ever receives row windows
 * and single-node details, never the whole tree.
 */
import type { JsonErrorInfo } from "./errors";
import { utf8ByteLength } from "./format";
import { decodeJsonString } from "./json-string";
import {
  ARRAY,
  buildIndex,
  buildIndexAuto,
  buildJsonlIndex,
  type DocumentFormat,
  type LineError,
  type NodeIndex,
  type NodeType,
  OBJECT,
  STRING,
  TYPE_NAMES,
  valueEnd,
} from "./node-index";
import { type PathSegment, toJsonPath } from "./path";
import { reformatJson } from "./reformat";

export interface Row {
  id: number;
  depth: number;
  /** null for the root, a number for array items. */
  key: string | number | null;
  type: NodeType;
  /** Display text for primitives (strings decoded and capped); "" for containers. */
  preview: string;
  /** True when a string preview was cut short. */
  truncated: boolean;
  childCount: number;
  expanded: boolean;
  /** JSONL: the 1-based line number of a line's top-level value. */
  line?: number;
}

export interface DocumentStats {
  name: string;
  sizeBytes: number;
  format: DocumentFormat;
  nodeCount: number;
  maxDepth: number;
  parseMs: number;
  /** JSONL: non-blank lines and how many of them are malformed. */
  lines: number;
  malformedLines: number;
}

export type LoadResult =
  | { ok: true; stats: DocumentStats; visibleCount: number; lineErrors: LineError[] }
  | { ok: false; error: JsonErrorInfo };

/** "auto" detects JSONL by file extension or by its parse-error signature. */
export type FormatChoice = DocumentFormat | "auto";

export interface NodeDetail {
  id: number;
  path: string;
  segments: PathSegment[];
  type: NodeType;
  childCount: number;
  sizeBytes: number;
  /** Full value for display: decoded string, number text, or pretty JSON for containers (capped). */
  value: string;
  valueTruncated: boolean;
  /** JSONL: the line this node belongs to (its path is relative to that line). */
  line?: number;
}

export type CopyFormat = "value" | "pretty" | "minified";

const CHECKPOINT_SHIFT = 8;
const KEY_PREVIEW_CHARS = 200;
const VALUE_PREVIEW_CHARS = 300;
const DETAIL_VALUE_CHARS = 200_000;

export class DocumentEngine {
  private index: NodeIndex | null = null;
  private stats: DocumentStats | null = null;
  private expanded = new Uint8Array(0);
  /** Node id at every 256th visible row. Visible node ids increase with row order. */
  private checkpoints = new Int32Array(0);
  private visible = 0;
  /** The last loaded text, kept even when it failed to parse, so the format can be switched. */
  private source: { text: string; name: string; sizeBytes: number } | null = null;

  load(
    text: string,
    name: string,
    sizeBytes?: number,
    onProgress?: (fraction: number) => void,
    format: FormatChoice = "auto",
  ): LoadResult {
    this.clear();
    this.source = { text, name, sizeBytes: sizeBytes ?? utf8ByteLength(text) };
    return this.reindex(format, onProgress);
  }

  /** Re-reads the current text as JSON or JSONL (the text stays in the worker). */
  setFormat(format: FormatChoice, onProgress?: (fraction: number) => void): LoadResult | null {
    if (!this.source) return null;
    return this.reindex(format, onProgress);
  }

  private reindex(format: FormatChoice, onProgress?: (fraction: number) => void): LoadResult {
    const source = this.source as NonNullable<typeof this.source>;
    this.index = null;
    const startedAt = performance.now();
    const result =
      format === "jsonl"
        ? { ok: true as const, index: buildJsonlIndex(source.text, onProgress) }
        : format === "json"
          ? buildIndex(source.text, onProgress)
          : buildIndexAuto(source.text, source.name, onProgress);
    if (!result.ok) return result;
    const { index } = result;
    let maxDepth = 0;
    for (let i = 0; i < index.count; i++) if (index.depth[i] > maxDepth) maxDepth = index.depth[i];
    this.index = index;
    this.stats = {
      name: source.name,
      sizeBytes: source.sizeBytes,
      format: index.format,
      nodeCount: index.format === "jsonl" ? index.count - 1 : index.count,
      maxDepth,
      parseMs: performance.now() - startedAt,
      lines: index.lines,
      malformedLines: index.malformedLines,
    };
    this.expanded = new Uint8Array(index.count);
    this.expanded[0] = 1;
    this.rebuild();
    return {
      ok: true,
      stats: this.stats,
      visibleCount: this.visible,
      lineErrors: index.lineErrors,
    };
  }

  clear(): void {
    this.source = null;
    this.index = null;
    this.stats = null;
    this.expanded = new Uint8Array(0);
    this.checkpoints = new Int32Array(0);
    this.visible = 0;
  }

  getStats(): DocumentStats | null {
    return this.stats;
  }

  visibleCount(): number {
    return this.visible;
  }

  /** Rows [start, end) of the currently visible (expanded) tree. */
  getRows(start: number, end: number): Row[] {
    const index = this.index;
    if (!index) return [];
    const from = Math.max(0, start);
    const to = Math.min(end, this.visible);
    if (from >= to) return [];
    const chunk = from >> CHECKPOINT_SHIFT;
    let id = this.checkpoints[chunk];
    let row = chunk << CHECKPOINT_SHIFT;
    while (row < from) {
      id = this.next(id);
      row++;
    }
    const rows: Row[] = [];
    for (; row < to; row++) {
      rows.push(this.row(id));
      id = this.next(id);
    }
    return rows;
  }

  toggle(id: number): number {
    return this.setExpanded(id, !this.expanded[id]);
  }

  setExpanded(id: number, expanded: boolean): number {
    if (!this.index || id <= 0 || id >= this.index.count) return this.visible;
    this.expanded[id] = expanded ? 1 : 0;
    this.rebuild();
    return this.visible;
  }

  /** Expands containers above `levels` (1 = only the root's children shown); Infinity expands all. */
  expandToDepth(levels: number): number {
    const index = this.index;
    if (!index) return 0;
    for (let i = 0; i < index.count; i++) {
      const container = index.type[i] === OBJECT || index.type[i] === ARRAY;
      this.expanded[i] = container && index.depth[i] < levels ? 1 : 0;
    }
    this.expanded[0] = 1;
    this.rebuild();
    return this.visible;
  }

  collapseAll(): number {
    return this.expandToDepth(1);
  }

  /** Row of a visible node, or -1 when an ancestor is collapsed. */
  rowOf(id: number): number {
    const index = this.index;
    if (!index || id < 0 || id >= index.count) return -1;
    const cps = this.checkpoints;
    let lo = 0;
    let hi = cps.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cps[mid] <= id) lo = mid;
      else hi = mid - 1;
    }
    let node = cps[lo];
    let row = lo << CHECKPOINT_SHIFT;
    while (node < id && row < this.visible) {
      node = this.next(node);
      row++;
    }
    return node === id && row < this.visible ? row : -1;
  }

  /** Expands every ancestor of `id` and returns its row. */
  reveal(id: number): number {
    const index = this.index;
    if (!index) return -1;
    for (let p = index.parent[id]; p >= 0; p = index.parent[p]) this.expanded[p] = 1;
    this.rebuild();
    return this.rowOf(id);
  }

  detail(id: number): NodeDetail | null {
    const index = this.index;
    if (!index || id < 0 || id >= index.count) return null;
    const segments = this.segments(id);
    const start = index.start[id];
    const type = index.type[id];
    const jsonl = index.format === "jsonl";
    if (jsonl && id === 0) {
      const value = reformatJson(this.jsonlArray(), 2, DETAIL_VALUE_CHARS);
      return {
        id,
        path: "$",
        segments: [],
        type: "array",
        childCount: index.childCount[0],
        sizeBytes: this.stats?.sizeBytes ?? 0,
        value: value.text,
        valueTruncated: value.truncated,
      };
    }
    // JSONL: each line is its own document; paths are relative to the line.
    const line = jsonl ? (segments[0] as number) + 1 : undefined;
    const pathSegments = jsonl ? segments.slice(1) : segments;
    const raw = index.text.slice(start, valueEnd(index, id));
    let value: { text: string; truncated: boolean };
    if (type === STRING) {
      const decoded = decodeJsonString(index.text, start, DETAIL_VALUE_CHARS);
      value = { text: decoded.value, truncated: decoded.truncated };
    } else if (type === OBJECT || type === ARRAY) {
      value = reformatJson(raw, 2, DETAIL_VALUE_CHARS);
    } else value = { text: raw, truncated: false };
    return {
      id,
      path: toJsonPath(pathSegments),
      segments: pathSegments,
      type: TYPE_NAMES[type],
      childCount: index.childCount[id],
      sizeBytes: id === 0 && this.stats ? this.stats.sizeBytes : utf8ByteLength(raw),
      value: value.text,
      valueTruncated: value.truncated,
      line,
    };
  }

  /** Text for the clipboard: the plain value, or the node as pretty / minified JSON. Lossless. */
  copyText(id: number, format: CopyFormat): string {
    const index = this.index;
    if (!index || id < 0 || id >= index.count) return "";
    if (index.format === "jsonl" && id === 0) {
      // The whole file: as JSON Lines (one minified value per line) or as a pretty JSON array.
      if (format === "pretty") return reformatJson(this.jsonlArray(), 2).text;
      return this.jsonlValues()
        .map((raw) => reformatJson(raw, 0).text)
        .join("\n");
    }
    const start = index.start[id];
    const raw = index.text.slice(start, valueEnd(index, id));
    if (format === "value" && index.type[id] === STRING) {
      return decodeJsonString(index.text, start).value;
    }
    if (format === "pretty") return reformatJson(raw, 2).text;
    return reformatJson(raw, 0).text;
  }

  /** Raw text of each valid JSONL line's value, in order. */
  private jsonlValues(): string[] {
    const index = this.index as NodeIndex;
    const out: string[] = [];
    for (let id = 1; id < index.count; id = index.subtreeEnd[id]) {
      out.push(index.text.slice(index.start[id], valueEnd(index, id)));
    }
    return out;
  }

  /** The valid JSONL lines as one JSON array text. */
  private jsonlArray(): string {
    return `[${this.jsonlValues().join(",")}]`;
  }

  private next(id: number): number {
    const index = this.index as NodeIndex;
    return this.expanded[id] && index.childCount[id] > 0 ? id + 1 : index.subtreeEnd[id];
  }

  private rebuild(): void {
    const index = this.index;
    if (!index) return;
    const cps: number[] = [];
    const mask = (1 << CHECKPOINT_SHIFT) - 1;
    let row = 0;
    for (let id = 0; id < index.count; id = this.next(id)) {
      if ((row & mask) === 0) cps.push(id);
      row++;
    }
    this.visible = row;
    this.checkpoints = Int32Array.from(cps);
  }

  private keyOf(id: number): string | number | null {
    const index = this.index as NodeIndex;
    if (index.parent[id] < 0) return null;
    const key = index.key[id];
    if (key < 0) return -key - 1;
    return decodeJsonString(index.text, key, KEY_PREVIEW_CHARS).value;
  }

  private segments(id: number): PathSegment[] {
    const index = this.index as NodeIndex;
    const out: PathSegment[] = [];
    for (let node = id; index.parent[node] >= 0; node = index.parent[node]) {
      const key = index.key[node];
      out.push(key < 0 ? -key - 1 : decodeJsonString(index.text, key).value);
    }
    return out.reverse();
  }

  private row(id: number): Row {
    const index = this.index as NodeIndex;
    const type = index.type[id];
    let preview = "";
    let truncated = false;
    if (type === STRING) {
      const decoded = decodeJsonString(index.text, index.start[id], VALUE_PREVIEW_CHARS);
      preview = decoded.value;
      truncated = decoded.truncated;
    } else if (type !== OBJECT && type !== ARRAY) {
      preview = index.text.slice(index.start[id], valueEnd(index, id));
    }
    const isLine = index.format === "jsonl" && index.parent[id] === 0;
    return {
      id,
      depth: index.depth[id],
      key: this.keyOf(id),
      type: TYPE_NAMES[type],
      preview,
      truncated,
      childCount: index.childCount[id],
      expanded: this.expanded[id] === 1,
      line: isLine ? -index.key[id] : undefined,
    };
  }
}
