import { describe, expect, it } from "vitest";

import { positionToLineColumn, toJsonError } from "@/lib/errors";

describe("positionToLineColumn", () => {
  it("is 1-based", () => {
    expect(positionToLineColumn("abc", 0)).toEqual({ line: 1, column: 1 });
    expect(positionToLineColumn("abc", 2)).toEqual({ line: 1, column: 3 });
  });

  it("counts lines", () => {
    const text = '{\n  "a": 1,\n  "b": }';
    expect(positionToLineColumn(text, text.indexOf("}", 5))).toEqual({ line: 3, column: 8 });
  });

  it("handles CRLF and positions on the newline itself", () => {
    const text = "[\r\n1,\r\n]";
    expect(positionToLineColumn(text, 3)).toEqual({ line: 2, column: 1 });
    expect(positionToLineColumn(text, 1)).toEqual({ line: 1, column: 2 });
  });

  it("clamps out-of-range positions", () => {
    expect(positionToLineColumn("ab\ncd", 99)).toEqual({ line: 2, column: 3 });
  });
});

describe("toJsonError", () => {
  it("extracts the position from the parser message", () => {
    const text = '{\n  "a": 1,\n}';
    const err = toJsonError(
      new SyntaxError("Quoted object key expected but got '}' at position 12"),
      text,
    );
    expect(err).toMatchObject({
      message: "Quoted object key expected but got '}'",
      position: 12,
      line: 3,
      column: 1,
      snippet: "}",
      caret: 0,
    });
  });

  it("strips the CR from CRLF lines in the snippet", () => {
    const text = '{"a" 1}\r\n';
    const err = toJsonError(new SyntaxError("x at position 5"), text);
    expect(err.snippet).toBe('{"a" 1}');
    expect(err.snippet[err.caret]).toBe("1");
  });

  it("clips long lines around the error and keeps the caret aligned", () => {
    const text = `[${"1,".repeat(5000)}x]`;
    const position = text.indexOf("x");
    const err = toJsonError(new SyntaxError(`bad at position ${position}`), text);
    expect(err.snippet.startsWith("…")).toBe(true);
    expect(err.snippet.length).toBeLessThan(100);
    expect(err.snippet[err.caret]).toBe("x");
  });

  it("falls back to end of input when there is no position", () => {
    const err = toJsonError(new Error("boom"), "ab\ncd");
    expect(err).toMatchObject({ message: "boom", position: 5, line: 2, column: 3 });
  });
});
