import { type Ref, useImperativeHandle, useRef } from "react";

import type { JsonEditorHandle } from "@/components/editor/types";

/** jsdom stand-in for the CodeMirror editor, with the same handle contract. */
export default function FakeJsonEditor({
  ref,
  onChange,
  wrap = false,
}: {
  ref?: Ref<JsonEditorHandle>;
  onChange: () => void;
  wrap?: boolean;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({
    getText: () => area.current?.value ?? "",
    setText: (text) => {
      if (area.current) area.current.value = text;
      onChange();
    },
    focusAt: (position) => {
      area.current?.focus();
      if (position !== undefined) area.current?.setSelectionRange(position, position);
    },
  }));
  return <textarea ref={area} aria-label="JSON editor" data-wrap={wrap} onChange={onChange} />;
}
