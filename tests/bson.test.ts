import { parse } from "lossless-json";
import { describe, expect, it } from "vitest";

import { childEntries, describeValue, toDocuments } from "@/lib/bson";

const d = (json: string) => describeValue(parse(json));

describe("describeValue: plain JSON", () => {
  it("formats primitives like Compass", () => {
    expect(d('"hi"')).toMatchObject({ kind: "string", text: '"hi"' });
    expect(d("12345678901234567890")).toMatchObject({
      kind: "number",
      text: "12345678901234567890",
    });
    expect(d("1.10")).toMatchObject({ kind: "number", text: "1.10" });
    expect(d("true")).toMatchObject({ kind: "boolean", text: "true" });
    expect(d("null")).toMatchObject({ kind: "null", text: "null" });
  });

  it("summarizes arrays and objects", () => {
    expect(d("[1,2,3]")).toEqual({ kind: "array", text: "Array (3)", size: 3 });
    expect(d("[]")).toEqual({ kind: "array", text: "Array (empty)", size: 0 });
    expect(d('{"a":1,"b":2}')).toEqual({ kind: "object", text: "Object", size: 2 });
    expect(d("{}")).toEqual({ kind: "object", text: "Object (empty)", size: 0 });
  });
});

describe("describeValue: MongoDB Extended JSON", () => {
  it("ObjectId", () => {
    expect(d('{"$oid":"6a9fdd120525594af2b1414c"}')).toMatchObject({
      kind: "objectId",
      text: "ObjectId('6a9fdd120525594af2b1414c')",
    });
  });

  it("dates in relaxed, canonical and legacy forms", () => {
    const text = "2024-03-01T10:00:00.000+00:00";
    expect(d('{"$date":"2024-03-01T10:00:00Z"}')).toMatchObject({ kind: "date", text });
    expect(d('{"$date":{"$numberLong":"1709287200000"}}')).toMatchObject({ kind: "date", text });
    expect(d('{"$date":1709287200000}')).toMatchObject({ kind: "date", text });
  });

  it("numeric wrappers", () => {
    expect(d('{"$numberInt":"42"}')).toMatchObject({ kind: "int32", text: "42" });
    expect(d('{"$numberLong":"9223372036854775807"}')).toMatchObject({
      kind: "int64",
      text: "9223372036854775807",
    });
    expect(d('{"$numberDouble":"Infinity"}')).toMatchObject({ kind: "double", text: "Infinity" });
    expect(d('{"$numberDecimal":"1.10"}')).toMatchObject({ kind: "decimal128", text: "1.10" });
  });

  it("other scalar types", () => {
    expect(d('{"$uuid":"3b241101-e2bb-4255-8caf-4136c566a962"}').text).toBe(
      "UUID('3b241101-e2bb-4255-8caf-4136c566a962')",
    );
    expect(d('{"$binary":{"base64":"AQID","subType":"04"}}').text).toBe(
      "Binary.createFromBase64('AQID', 4)",
    );
    expect(d('{"$timestamp":{"t":1700000000,"i":3}}').text).toBe(
      "Timestamp({ t: 1700000000, i: 3 })",
    );
    expect(d('{"$regularExpression":{"pattern":"^a.*","options":"i"}}').text).toBe("/^a.*/i");
    expect(d('{"$minKey":1}').text).toBe("MinKey()");
    expect(d('{"$maxKey":1}').text).toBe("MaxKey()");
  });

  it("does not treat look-alikes as Extended JSON", () => {
    expect(d('{"$oid":"not-hex"}').kind).toBe("object");
    expect(d('{"$oid":"6a9fdd120525594af2b1414c","extra":1}').kind).toBe("object");
    expect(d('{"$date":"not a date"}').kind).toBe("object");
  });
});

describe("childEntries", () => {
  it("pages arrays without materializing the rest", () => {
    const value = parse(`[${Array.from({ length: 1000 }, (_, i) => i).join(",")}]`);
    const { entries, total } = childEntries(value, 100);
    expect(total).toBe(1000);
    expect(entries).toHaveLength(100);
    expect(entries[99][0]).toBe("99");
  });

  it("keeps object key order", () => {
    const { entries } = childEntries(parse('{"z":1,"a":2,"m":3}'));
    expect(entries.map(([k]) => k)).toEqual(["z", "a", "m"]);
  });

  it("treats Extended JSON scalars as leaves", () => {
    expect(childEntries(parse('{"$oid":"6a9fdd120525594af2b1414c"}')).total).toBe(0);
  });
});

describe("toDocuments", () => {
  it("splits a root array into documents and wraps a root object", () => {
    expect(toDocuments([1, 2])).toEqual([1, 2]);
    expect(toDocuments({ a: 1 })).toEqual([{ a: 1 }]);
  });
});
