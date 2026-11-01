import { Check, CircleAlert, Copy, FolderOpen, LoaderCircle, Trash2 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { DocumentView } from "@/components/documents/DocumentView";
import { TreePane } from "@/components/tree/TreePane";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";
import type { JsonErrorInfo } from "@/lib/errors";
import { formatBytes, utf8ByteLength } from "@/lib/format";
import { beautifyJson, minifyJson, parseJson } from "@/lib/json";
import { cn } from "@/lib/utils";
import { useTreeStore } from "@/store/useTreeStore";
import { useViewerStore } from "@/store/useViewerStore";
import { getParser } from "@/workers/client";
import type { LoadSource } from "@/workers/parser.worker";

import { ErrorPanel } from "./ErrorPanel";
import type { JsonEditorHandle } from "./types";
import { type ViewMode, ViewModeSwitch } from "./ViewModeSwitch";

// CodeMirror is the heaviest dependency; keep it out of the main bundle.
const JsonEditor = lazy(() => import("./JsonEditor"));

const UNTITLED = "Untitled";
/** Above this size, documents skip the editor and open in Tree mode only (PLAN.md 1.6). */
export const TEXT_VIEW_LIMIT = 20 * 1024 * 1024;
// Parsing runs on the main thread (~20ms/MB), so wait longer before re-validating big documents.
const LARGE_DOC_CHARS = 2_000_000;
const VALIDATE_DELAY_MS = 250;
const VALIDATE_DELAY_LARGE_MS = 1000;

type Status =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "valid" }
  | { kind: "invalid"; error: JsonErrorInfo };

/** A document too big for the editor; it lives only in the parser worker. */
interface BigDocument {
  name: string;
  sizeBytes: number;
}

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    Boolean(target.closest("input, textarea, [contenteditable='true']")));

export function EditorPane() {
  const editorRef = useRef<JsonEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const applyingRef = useRef(false);
  // Last successfully parsed value, or null when the text changed since.
  const parsedRef = useRef<{ value: unknown } | null>(null);
  const setStats = useViewerStore((s) => s.setStats);
  const treeStatus = useTreeStore((s) => s.status);
  const [status, setStatus] = useState<Status>({ kind: "empty" });
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const [mode, setMode] = useState<ViewMode>("beautify");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [docName, setDocName] = useState(UNTITLED);
  const docNameRef = useRef(docName);
  docNameRef.current = docName;
  const [bigDoc, setBigDoc] = useState<BigDocument | null>(null);
  // In "object" mode this holds the parsed root shown by DocumentView.
  const [documents, setDocuments] = useState<{ root: unknown } | null>(null);
  const [dragging, setDragging] = useState(false);
  // True until the editor first holds content, so a paste into an empty editor follows the mode.
  const wasEmptyRef = useRef(true);
  // Editor text revisions, to know whether the tree shows the current text.
  const textVersionRef = useRef(0);
  const treeVersionRef = useRef(-1);

  const showValid = useCallback(
    (text: string, nodeCount: number, parseMs: number) => {
      setStatus({ kind: "valid" });
      setStats({
        fileName: docNameRef.current,
        sizeBytes: utf8ByteLength(text),
        nodeCount,
        parseMs,
      });
    },
    [setStats],
  );

  /** Indexes the editor text in the worker for Tree mode, unless it is already current. */
  const syncTree = useCallback(() => {
    if (treeVersionRef.current === textVersionRef.current) return;
    treeVersionRef.current = textVersionRef.current;
    void useTreeStore
      .getState()
      .load({ text: editorRef.current?.getText() ?? "" }, docNameRef.current);
  }, []);

  /** Rewrites the editor text minified or beautified. Returns false (and shows the error) if invalid. */
  const applyFormat = useCallback(
    (format: "minify" | "beautify"): boolean => {
      const editor = editorRef.current;
      if (!editor) return false;
      window.clearTimeout(timerRef.current);
      const result = (format === "minify" ? minifyJson : beautifyJson)(editor.getText());
      if (!result.ok) {
        setStatus({ kind: "invalid", error: result.error });
        setStats(null);
        editor.focusAt(result.error.position);
        return false;
      }
      // The formatted text is already known to be valid; skip re-parsing it.
      parsedRef.current = null;
      applyingRef.current = true;
      editor.setText(result.text);
      textVersionRef.current++;
      applyingRef.current = false;
      showValid(result.text, result.nodeCount, result.parseMs);
      editor.focusAt();
      return true;
    },
    [setStats, showValid],
  );

  const validate = useCallback(() => {
    const text = editorRef.current?.getText() ?? "";
    if (text.trim() === "") {
      wasEmptyRef.current = true;
      setStatus({ kind: "empty" });
      setStats(null);
      return;
    }
    const firstContent = wasEmptyRef.current;
    wasEmptyRef.current = false;
    const result = parseJson(text);
    const current = modeRef.current;
    if (!result.ok) {
      setStatus({ kind: "invalid", error: result.error });
      setStats(null);
      // Structured views can't show invalid JSON; return to the editor to show the error.
      if (current === "object" || current === "tree") {
        setDocuments(null);
        setMode("beautify");
      }
      return;
    }
    // JSON pasted into an empty editor is shown in the selected format right away.
    if (firstContent && (current === "minify" || current === "beautify") && applyFormat(current)) {
      return;
    }
    parsedRef.current = { value: result.value };
    showValid(text, result.nodeCount, result.parseMs);
    if (current === "object") setDocuments({ root: result.value });
    if (current === "tree") syncTree();
  }, [setStats, showValid, applyFormat, syncTree]);

  const handleChange = useCallback(() => {
    if (applyingRef.current) return;
    parsedRef.current = null;
    textVersionRef.current++;
    window.clearTimeout(timerRef.current);
    const length = editorRef.current?.getText().length ?? 0;
    const delay = length > LARGE_DOC_CHARS ? VALIDATE_DELAY_LARGE_MS : VALIDATE_DELAY_MS;
    timerRef.current = window.setTimeout(validate, delay);
  }, [validate]);

  useEffect(() => {
    return () => window.clearTimeout(timerRef.current);
  }, []);

  /** Replaces the editor text with a new document (≤ 20 MB) and shows it in the current mode. */
  const openText = useCallback(
    (text: string, name: string) => {
      setBigDoc(null);
      setDocName(name);
      docNameRef.current = name;
      wasEmptyRef.current = true;
      editorRef.current?.setText(text);
      window.clearTimeout(timerRef.current);
      validate();
    },
    [validate],
  );

  /** Opens a document too large for the editor straight into the worker, in Tree mode. */
  const openBig = useCallback(
    async (source: LoadSource, name: string, sizeBytes: number) => {
      window.clearTimeout(timerRef.current);
      applyingRef.current = true;
      editorRef.current?.setText("");
      applyingRef.current = false;
      textVersionRef.current++;
      parsedRef.current = null;
      setDocuments(null);
      setDocName(name);
      setBigDoc({ name, sizeBytes });
      setMode("tree");
      setStatus({ kind: "loading" });
      setStats(null);
      const ok = await useTreeStore.getState().load(source, name);
      const { stats, error } = useTreeStore.getState();
      if (ok && stats) {
        setStatus({ kind: "valid" });
        setStats({ fileName: name, sizeBytes, nodeCount: stats.nodeCount, parseMs: stats.parseMs });
      } else if (error) {
        setStatus({ kind: "invalid", error });
      }
    },
    [setStats],
  );

  const openFile = useCallback(
    async (file: File) => {
      if (file.size > TEXT_VIEW_LIMIT) await openBig({ file }, file.name, file.size);
      else openText(await file.text(), file.name);
    },
    [openBig, openText],
  );

  // ⌘V anywhere (when no text field has focus) opens the clipboard text as the document.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isEditable(event.target)) return;
      const text = event.clipboardData?.getData("text/plain");
      if (!text) return;
      event.preventDefault();
      if (text.length > TEXT_VIEW_LIMIT) void openBig({ text }, UNTITLED, utf8ByteLength(text));
      else openText(text, UNTITLED);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [openBig, openText]);

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void openFile(file);
    else {
      const text = event.dataTransfer.getData("text/plain");
      if (text) openText(text, UNTITLED);
    }
  };

  const copy = async () => {
    const text = bigDoc
      ? getParser().copyText(0, "minified")
      : Promise.resolve(editorRef.current?.getText() ?? "");
    try {
      await copyToClipboard(text);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    window.setTimeout(() => setCopied(null), 1500);
  };

  const clear = () => {
    setBigDoc(null);
    setDocuments(null);
    setDocName(UNTITLED);
    docNameRef.current = UNTITLED;
    useTreeStore.getState().reset();
    treeVersionRef.current = -1;
    if (mode === "object" || mode === "tree") setMode("beautify");
    editorRef.current?.setText("");
    window.clearTimeout(timerRef.current);
    validate();
    editorRef.current?.focusAt();
  };

  const selectMode = (next: ViewMode) => {
    if (bigDoc) return; // Only Tree is available; the other options are disabled.
    if (next === "object" || next === "tree") {
      // Validation is debounced; make sure we show the current text, not a stale parse.
      if (!parsedRef.current) {
        window.clearTimeout(timerRef.current);
        validate();
      }
      if (!parsedRef.current) return;
      if (next === "object") setDocuments({ root: parsedRef.current.value });
      else {
        setDocuments(null);
        syncTree();
      }
      setMode(next);
      return;
    }
    setDocuments(null);
    const hasText = (editorRef.current?.getText().trim() ?? "") !== "";
    // An empty editor just remembers the mode for the next paste.
    if (!hasText || applyFormat(next)) setMode(next);
    if (!hasText) editorRef.current?.focusAt();
  };

  const empty = status.kind === "empty";
  const showingDocuments = mode === "object" && documents !== null;
  const showingTree = mode === "tree";
  const showingEditor = !showingDocuments && !showingTree;
  const tooBig = bigDoc ? `Text views work up to ${formatBytes(TEXT_VIEW_LIMIT)}` : undefined;
  const needsValid = status.kind === "valid" ? undefined : "Needs valid JSON";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target only; the Open button is the keyboard path.
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files") && !e.dataTransfer.types.includes("text/plain"))
          return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <ViewModeSwitch
          mode={mode}
          onSelect={selectMode}
          disabled={{
            minify: tooBig,
            beautify: tooBig,
            object: tooBig ?? (mode === "object" ? undefined : needsValid),
            tree: bigDoc ? undefined : mode === "tree" ? undefined : needsValid,
          }}
        />
        <div className="mx-1 h-4 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
          <FolderOpen data-icon="inline-start" />
          Open
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.jsonl,.geojson,.txt,application/json,text/plain"
          className="hidden"
          aria-label="Open JSON file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openFile(file);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={empty || status.kind === "loading"}
          onClick={copy}
        >
          {copied === "ok" ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied === "ok" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" disabled={empty && !bigDoc} onClick={clear}>
          <Trash2 data-icon="inline-start" />
          Clear
        </Button>
        {bigDoc && (
          <span className="ml-1 text-muted-foreground text-xs">
            {formatBytes(bigDoc.sizeBytes)} · Tree only (text views work up to{" "}
            {formatBytes(TEXT_VIEW_LIMIT)})
          </span>
        )}
        <div className="ml-auto pr-1 text-xs">
          <ValidityBadge status={status} treeLoading={treeStatus === "loading"} />
        </div>
      </div>

      {showingDocuments && documents && <DocumentView root={documents.root} />}
      {showingTree && <TreePane />}

      {/* Kept mounted while other views are shown, so text and undo history survive. */}
      <div className={cn("min-h-0 flex-1", !showingEditor && "hidden")}>
        <Suspense
          fallback={<div className="p-4 text-muted-foreground text-sm">Loading editor…</div>}
        >
          <JsonEditor ref={editorRef} onChange={handleChange} wrap={mode === "minify"} />
        </Suspense>
      </div>

      {status.kind === "invalid" && showingEditor && !bigDoc && (
        <ErrorPanel
          error={status.error}
          onJump={() => editorRef.current?.focusAt(status.error.position)}
        />
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-primary/60 border-dashed bg-background/80 text-sm">
          Drop a JSON file to open it
        </div>
      )}
    </div>
  );
}

function ValidityBadge({ status, treeLoading }: { status: Status; treeLoading: boolean }) {
  if (status.kind === "loading" || (treeLoading && status.kind === "valid")) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        Loading
      </span>
    );
  }
  if (status.kind === "empty") return null;
  if (status.kind === "valid") {
    return (
      <span className="inline-flex items-center gap-1 text-syntax-string">
        <Check className="size-3.5" aria-hidden />
        Valid JSON
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-destructive">
      <CircleAlert className="size-3.5" aria-hidden />
      Invalid JSON
    </span>
  );
}
