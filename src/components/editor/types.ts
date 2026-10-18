export interface JsonEditorHandle {
  getText(): string;
  /** Replaces the whole document as one undoable change. */
  setText(text: string): void;
  /** Focuses the editor, optionally moving the cursor to a character offset. */
  focusAt(position?: number): void;
}
