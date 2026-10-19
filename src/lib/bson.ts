import { isLosslessNumber } from "lossless-json";

/**
 * Display model for MongoDB Compass-style document views.
 * Values come from lossless-json, so numbers are LosslessNumber instances.
 * MongoDB Extended JSON wrappers ({"$oid": …}, {"$date": …}, …) display as their BSON type.
 */
export type ValueKind =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "array"
  | "object"
  | "objectId"
  | "date"
  | "int32"
  | "int64"
  | "double"
  | "decimal128"
  | "binary"
  | "uuid"
  | "timestamp"
  | "regex"
  | "minKey"
  | "maxKey";

export interface ValueDescription {
  kind: ValueKind;
  /** Compass-style text, e.g. `ObjectId('…')`, `"text"`, `Array (19)`. */
  text: string;
  /** Number of child entries for arrays and objects; 0 for leaves. */
  size: number;
}

/** Human-readable BSON type name, used for tooltips. */
export const KIND_LABEL: Record<ValueKind, string> = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  null: "Null",
  array: "Array",
  object: "Object",
  objectId: "ObjectId",
  date: "Date",
  int32: "Int32",
  int64: "Int64",
  double: "Double",
  decimal128: "Decimal128",
  binary: "Binary",
  uuid: "UUID",
  timestamp: "Timestamp",
  regex: "RegExp",
  minKey: "MinKey",
  maxKey: "MaxKey",
};

type Obj = Record<string, unknown>;

export function isPlainObject(value: unknown): value is Obj {
  return (
    value !== null && typeof value === "object" && !Array.isArray(value) && !isLosslessNumber(value)
  );
}

const isStr = (v: unknown): v is string => typeof v === "string";
const numText = (v: unknown): string | null =>
  isLosslessNumber(v) ? String(v) : typeof v === "number" ? String(v) : null;

function onlyKeys(obj: Obj, ...keys: string[]): boolean {
  const own = Object.keys(obj);
  return own.length === keys.length && keys.every((k) => k in obj);
}

/** Compass shows dates as `2024-03-01T10:00:00.000+00:00`. */
function formatDate(ms: number): string | null {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/Z$/, "+00:00");
}

/** Recognizes a MongoDB Extended JSON (v2, canonical or relaxed) scalar wrapper. */
export function describeExtendedJson(obj: Obj): ValueDescription | null {
  const leaf = (kind: ValueKind, text: string): ValueDescription => ({ kind, text, size: 0 });

  if (onlyKeys(obj, "$oid") && isStr(obj.$oid) && /^[0-9a-fA-F]{24}$/.test(obj.$oid)) {
    return leaf("objectId", `ObjectId('${obj.$oid}')`);
  }
  if (onlyKeys(obj, "$date")) {
    const raw = obj.$date;
    let ms: number | null = null;
    if (isStr(raw)) ms = Date.parse(raw);
    else if (numText(raw) !== null) ms = Number(numText(raw));
    else if (isPlainObject(raw) && onlyKeys(raw, "$numberLong") && isStr(raw.$numberLong)) {
      ms = Number(raw.$numberLong);
    }
    const text = ms === null ? null : formatDate(ms);
    if (text) return leaf("date", text);
  }
  if (onlyKeys(obj, "$numberInt") && isStr(obj.$numberInt)) return leaf("int32", obj.$numberInt);
  if (onlyKeys(obj, "$numberLong") && isStr(obj.$numberLong)) return leaf("int64", obj.$numberLong);
  if (onlyKeys(obj, "$numberDouble") && isStr(obj.$numberDouble)) {
    return leaf("double", obj.$numberDouble);
  }
  if (onlyKeys(obj, "$numberDecimal") && isStr(obj.$numberDecimal)) {
    return leaf("decimal128", obj.$numberDecimal);
  }
  if (onlyKeys(obj, "$uuid") && isStr(obj.$uuid)) return leaf("uuid", `UUID('${obj.$uuid}')`);
  if (onlyKeys(obj, "$binary")) {
    const bin = obj.$binary;
    if (isPlainObject(bin) && onlyKeys(bin, "base64", "subType") && isStr(bin.base64)) {
      const subType = isStr(bin.subType) ? Number.parseInt(bin.subType, 16) : 0;
      return leaf("binary", `Binary.createFromBase64('${bin.base64}', ${subType})`);
    }
  }
  if (onlyKeys(obj, "$timestamp")) {
    const ts = obj.$timestamp;
    if (isPlainObject(ts) && onlyKeys(ts, "t", "i") && numText(ts.t) && numText(ts.i)) {
      return leaf("timestamp", `Timestamp({ t: ${numText(ts.t)}, i: ${numText(ts.i)} })`);
    }
  }
  if (onlyKeys(obj, "$regularExpression")) {
    const re = obj.$regularExpression;
    if (isPlainObject(re) && onlyKeys(re, "pattern", "options") && isStr(re.pattern)) {
      return leaf("regex", `/${re.pattern}/${isStr(re.options) ? re.options : ""}`);
    }
  }
  if (onlyKeys(obj, "$minKey")) return leaf("minKey", "MinKey()");
  if (onlyKeys(obj, "$maxKey")) return leaf("maxKey", "MaxKey()");
  return null;
}

export function describeValue(value: unknown): ValueDescription {
  if (value === null) return { kind: "null", text: "null", size: 0 };
  if (typeof value === "string") return { kind: "string", text: `"${value}"`, size: 0 };
  if (typeof value === "boolean") return { kind: "boolean", text: String(value), size: 0 };
  if (typeof value === "number" || isLosslessNumber(value)) {
    return { kind: "number", text: String(value), size: 0 };
  }
  if (Array.isArray(value)) {
    const size = value.length;
    return { kind: "array", text: size ? `Array (${size})` : "Array (empty)", size };
  }
  if (isPlainObject(value)) {
    const ejson = describeExtendedJson(value);
    if (ejson) return ejson;
    const size = Object.keys(value).length;
    return { kind: "object", text: size ? "Object" : "Object (empty)", size };
  }
  return { kind: "string", text: String(value), size: 0 };
}

/**
 * The first `limit` child entries of an array or object, plus the total count.
 * Leaves and Extended JSON scalars have no children. Only the requested page is
 * materialized, so huge arrays (e.g. embeddings) stay cheap to render.
 */
export function childEntries(
  value: unknown,
  limit = Number.POSITIVE_INFINITY,
): { entries: [string, unknown][]; total: number } {
  if (Array.isArray(value)) {
    const entries = value.slice(0, limit).map((item, i): [string, unknown] => [String(i), item]);
    return { entries, total: value.length };
  }
  if (isPlainObject(value) && !describeExtendedJson(value)) {
    const keys = Object.keys(value);
    const entries = keys.slice(0, limit).map((k): [string, unknown] => [k, value[k]]);
    return { entries, total: keys.length };
  }
  return { entries: [], total: 0 };
}

/** Top-level documents: each element of a root array, or the root itself. */
export function toDocuments(root: unknown): unknown[] {
  return Array.isArray(root) ? root : [root];
}
