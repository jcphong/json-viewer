import { isolateHistory } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, placeholder } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { type Ref, useEffect, useImperativeHandle, useRef } from "react";

import type { JsonEditorHandle } from "./types";

// Colors come from CSS variables in globals.css so the editor follows light/dark mode.
const jsonHighlight = HighlightStyle.define([
  { tag: t.propertyName, color: "var(--syntax-key)" },
  { tag: t.string, color: "var(--syntax-string)" },
  { tag: t.number, color: "var(--syntax-number)" },
  { tag: [t.bool, t.null], color: "var(--syntax-literal)" },
  { tag: [t.separator, t.brace, t.squareBracket], color: "var(--syntax-punctuation)" },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.6" },
  ".cm-content": { caretColor: "var(--foreground)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLine": { backgroundColor: "var(--editor-active-line)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--editor-selection)" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--editor-selection)",
    outline: "none",
  },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--muted)",
    border: "none",
    color: "var(--muted-foreground)",
  },
  ".cm-panels": { backgroundColor: "var(--muted)", color: "var(--foreground)" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
  },
});

interface JsonEditorProps {
  ref?: Ref<JsonEditorHandle>;
  /** Called on every document change. Read the text with `getText()` when needed. */
  onChange: () => void;
}

export default function JsonEditor({ ref, onChange }: JsonEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: "",
        extensions: [
          basicSetup,
          json(),
          syntaxHighlighting(jsonHighlight),
          editorTheme,
          placeholder("Paste or type JSON here…"),
          EditorView.contentAttributes.of({ "aria-label": "JSON editor" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current();
          }),
        ],
      }),
    });
    viewRef.current = view;
    view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getText: () => viewRef.current?.state.doc.toString() ?? "",
      setText: (text) => {
        const view = viewRef.current;
        if (!view) return;
        // One isolated history entry, so ⌘Z restores exactly the previous text
        // even when two formats happen in quick succession.
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: { anchor: 0 },
          scrollIntoView: true,
          annotations: isolateHistory.of("full"),
        });
      },
      focusAt: (position) => {
        const view = viewRef.current;
        if (!view) return;
        if (position !== undefined) {
          const anchor = Math.max(0, Math.min(position, view.state.doc.length));
          view.dispatch({ selection: { anchor }, scrollIntoView: true });
        }
        view.focus();
      },
    }),
    [],
  );

  return <div ref={hostRef} className="h-full min-h-0 font-mono" />;
}
