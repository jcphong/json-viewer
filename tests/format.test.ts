import { describe, expect, it } from "vitest";

import { formatBytes, formatCount, formatDuration, utf8ByteLength } from "@/lib/format";

describe("formatBytes", () => {
  it("formats bytes, KB, MB, GB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50.0 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });

  it("caps at GB", () => {
    expect(formatBytes(2048 * 1024 ** 3)).toBe("2048.0 GB");
  });

  it("handles invalid input", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
  });
});

describe("formatCount", () => {
  it("adds thousands separators", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(200000)).toBe("200,000");
    expect(formatCount(1234567)).toBe("1,234,567");
  });
});

describe("formatDuration", () => {
  it("uses ms below one second and s above", () => {
    expect(formatDuration(0.4)).toBe("<1 ms");
    expect(formatDuration(42.3)).toBe("42 ms");
    expect(formatDuration(999)).toBe("999 ms");
    expect(formatDuration(2150)).toBe("2.15 s");
  });

  it("handles invalid input", () => {
    expect(formatDuration(-5)).toBe("—");
  });
});

describe("utf8ByteLength", () => {
  it("matches TextEncoder", () => {
    for (const text of ["", "abc", "é", "€", "😀", "a😀b", "שלום", "\u0000", "\ud800 lone"]) {
      expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length);
    }
  });
});
