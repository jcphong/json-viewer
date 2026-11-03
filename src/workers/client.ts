import * as Comlink from "comlink";

import type { ParserApi } from "./parser.worker";

export type Parser = Comlink.Remote<ParserApi>;

let parser: Parser | null = null;

/** The shared parser worker, started on first use. */
export function getParser(): Parser {
  if (!parser) {
    const worker = new Worker(new URL("./parser.worker.ts", import.meta.url), {
      type: "module",
      name: "json-parser",
    });
    parser = Comlink.wrap<ParserApi>(worker);
  }
  return parser;
}

/** Wraps a callback so the worker can call it (e.g. load progress). */
export const remoteCallback = <T extends (...args: never[]) => unknown>(fn: T) => Comlink.proxy(fn);
