import { describe, expect, it } from "vitest";

import indexHtml from "../index.html?raw";
import vercelJson from "../vercel.json?raw";

interface VercelConfig {
  buildCommand: string;
  outputDirectory: string;
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

const vercel = JSON.parse(vercelJson) as VercelConfig;

function csp(): Map<string, string> {
  const value = vercel.headers
    .find((rule) => rule.source === "/(.*)")
    ?.headers.find((h) => h.key === "Content-Security-Policy")?.value;
  if (!value) throw new Error("vercel.json has no Content-Security-Policy for /(.*)");
  return new Map(
    value.split(";").map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name, sources.join(" ")] as [string, string];
    }),
  );
}

describe("vercel.json", () => {
  it("builds with the type-checking build script into dist/", () => {
    expect(vercel.buildCommand).toBe("pnpm build");
    expect(vercel.outputDirectory).toBe("dist");
  });

  it("CSP keeps all data in the browser: no third-party connections or scripts", () => {
    const policy = csp();
    expect(policy.get("default-src")).toBe("'self'");
    expect(policy.get("connect-src")).toBe("'self'");
    expect(policy.get("script-src")).toBe("'self'");
    expect(policy.get("frame-ancestors")).toBe("'none'");
    expect(policy.get("object-src")).toBe("'none'");
  });
});

describe("index.html", () => {
  it("has no inline scripts, which the CSP would block", () => {
    const scripts = [...indexHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attrs, body] of scripts) {
      expect(attrs).toMatch(/\bsrc=/);
      expect(body.trim()).toBe("");
    }
  });
});
