import { Check, CircleAlert, Copy, Trash2 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { DocumentView } from "@/components/documents/DocumentView";
import { Button } from "@/components/ui/button";
import type { JsonErrorInfo } from "@/lib/errors";
import { utf8ByteLength } from "@/lib/format";
import { beautifyJson, minifyJson, parseJson } from "@/lib/json";
import { cn } from "@/lib/utils";
import { useViewerStore } from "@/store/useViewerStore";

import type { JsonEditorHandle } from "./types";
import { type ViewMode, ViewModeSwitch } from "./ViewModeSwitch";

// CodeMirror is the heaviest dependency; keep it out of the main bundle.
const JsonEditor = lazy(() => import("./JsonEditor"));

const DOCUMENT_NAME = "Untitled";
// Parsing runs on the main thread (~20ms/MB), so wait longer before re-validating big documents.
const LARGE_DOC_CHARS = 2_000_000;
const VALIDATE_DELAY_MS = 250;
const VALIDATE_DELAY_LARGE_MS = 1000;

type Status = { kind: "empty" } | { kind: "valid" } | { kind: "invalid"; error: JsonErrorInfo };

export function EditorPane() {
  const editorRef = useRef<JsonEditorHandle>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const applyingRef = useRef(false);
  // Last successfully parsed value, or null when the text changed since.
  const parsedRef = useRef<{ value: unknown } | null>(null);
  const setStats = useViewerStore((s) => s.setStats);
  const [status, setStatus] = useState<Status>({ kind: "empty" });
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const [mode, setMode] = useState<ViewMode>("beautify");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // In "object" mode this holds the parsed root shown by DocumentView.
  const [documents, setDocuments] = useState<{ root: unknown } | null>(null);
  // True until the editor first holds content, so a paste into an empty editor follows the mode.
  const wasEmptyRef = useRef(true);

  const showValid = useCallback(
    (text: string, nodeCount: number, parseMs: number) => {
      setStatus({ kind: "valid" });
      setStats({ fileName: DOCUMENT_NAME, sizeBytes: utf8ByteLength(text), nodeCount, parseMs });
    },
    [setStats],
  );

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
    if (!result.ok) {
      setStatus({ kind: "invalid", error: result.error });
      setStats(null);
      return;
    }
    const current = modeRef.current;
    // JSON pasted into an empty editor is shown in the selected format right away.
    if (firstContent && current !== "object" && applyFormat(current)) return;
    parsedRef.current = { value: result.value };
    showValid(text, result.nodeCount, result.parseMs);
  }, [setStats, showValid, applyFormat]);

  const handleChange = useCallback(() => {
    if (applyingRef.current) return;
    parsedRef.current = null;
    window.clearTimeout(timerRef.current);
    const length = editorRef.current?.getText().length ?? 0;
    const delay = length > LARGE_DOC_CHARS ? VALIDATE_DELAY_LARGE_MS : VALIDATE_DELAY_MS;
    timerRef.current = window.setTimeout(validate, delay);
  }, [validate]);

  useEffect(() => {
    return () => window.clearTimeout(timerRef.current);
  }, []);

  const copy = async () => {
    const text = editorRef.current?.getText() ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    window.setTimeout(() => setCopied(null), 1500);
  };

  const clear = () => {
    editorRef.current?.setText("");
    editorRef.current?.focusAt();
  };

  const selectMode = (next: ViewMode) => {
    if (next === "object") {
      // Validation is debounced; make sure we show the current text, not a stale parse.
      if (!parsedRef.current) {
        window.clearTimeout(timerRef.current);
        validate();
      }
      if (!parsedRef.current) return;
      setDocuments({ root: parsedRef.current.value });
      setMode("object");
      return;
    }
    setDocuments(null);
    const hasText = (editorRef.current?.getText().trim() ?? "") !== "";
    // An empty editor just remembers the mode for the next paste.
    if (!hasText || applyFormat(next)) setMode(next);
    if (!hasText) editorRef.current?.focusAt();
  };

  const empty = status.kind === "empty";
  const showingDocuments = documents !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <ViewModeSwitch
          mode={mode}
          onSelect={selectMode}
          objectDisabled={mode !== "object" && status.kind !== "valid"}
        />
        <div className="mx-1 h-4 w-px bg-border" />
        <Button size="sm" variant="ghost" disabled={empty} onClick={copy}>
          {copied === "ok" ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied === "ok" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" disabled={empty || showingDocuments} onClick={clear}>
          <Trash2 data-icon="inline-start" />
          Clear
        </Button>
        <div className="ml-auto pr-1 text-xs">
          <ValidityBadge status={status} />
        </div>
      </div>

      {documents && <DocumentView root={documents.root} />}

      {/* Kept mounted while the document view is shown, so text and undo history survive. */}
      <div className={cn("min-h-0 flex-1", showingDocuments && "hidden")}>
        <Suspense
          fallback={<div className="p-4 text-muted-foreground text-sm">Loading editor…</div>}
        >
          <JsonEditor ref={editorRef} onChange={handleChange} wrap={mode === "minify"} />
        </Suspense>
      </div>

      {status.kind === "invalid" && !showingDocuments && (
        <ErrorPanel
          error={status.error}
          onJump={() => editorRef.current?.focusAt(status.error.position)}
        />
      )}
    </div>
  );
}

function ValidityBadge({ status }: { status: Status }) {
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

function ErrorPanel({ error, onJump }: { error: JsonErrorInfo; onJump: () => void }) {
  return (
    <div
      role="alert"
      className="shrink-0 border-destructive/30 border-t bg-destructive/5 px-3 py-2 text-sm"
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium text-destructive">
          Line {error.line}, column {error.column}
        </span>
        <span className="text-foreground">{error.message}</span>
        <Button size="xs" variant="link" className="h-auto px-0" onClick={onJump}>
          Go to error
        </Button>
      </div>
      <pre className="mt-1 overflow-x-auto font-mono text-muted-foreground text-xs leading-5">
        {error.snippet}
        {"\n"}
        <span className="text-destructive">{`${" ".repeat(error.caret)}^`}</span>
      </pre>
    </div>
  );
}
