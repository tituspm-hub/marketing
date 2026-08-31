import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/index.css", "utf8");

// Declarations later in the file win, exactly as the emitted :root does. Reading the
// raw text is not enough: `@theme inline` can shadow a brand token further up and a
// substring assertion would still pass while the app renders the wrong colour.
function declarations() {
  const map = new Map();
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

function resolve(name, seen = new Set()) {
  const map = declarations();
  let value = map.get(name);
  if (value === undefined) return undefined;
  let hop = value.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i);
  while (hop) {
    if (seen.has(hop[1])) throw new Error(`circular token reference at ${hop[1]}`);
    seen.add(hop[1]);
    value = map.get(hop[1]);
    if (value === undefined) return undefined;
    hop = value.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i);
  }
  return value;
}

function occurrences(name) {
  return [...css.matchAll(new RegExp(`(^|[\\s{;])${name}\\s*:`, "g"))].length;
}

describe("design tokens", () => {
  it("defines every colour the spec names", () => {
    for (const token of [
      "--color-ink", "--color-muted", "--color-line", "--color-surface",
      "--color-primary", "--color-primary-hover",
      "--color-peach", "--color-sky", "--color-mint",
      "--color-lilac", "--color-blush", "--color-cream",
      "--color-success", "--color-danger", "--color-warn",
    ]) {
      expect(resolve(token), token).toBeDefined();
    }
  });

  it("resolves the Hire3x primary blue through whatever aliases it", () => {
    expect(resolve("--color-primary").toUpperCase()).toBe("#2D68FE");
    expect(resolve("--color-ring").toUpperCase()).toBe("#2D68FE");
  });

  it("keeps the shadcn semantic colours on the Hire3x palette", () => {
    expect(resolve("--color-border").toUpperCase()).toBe("#E8EAEE");
    expect(resolve("--color-muted-foreground").toUpperCase()).toBe("#6B7280");
    expect(resolve("--color-foreground").toUpperCase()).toBe("#0A0A0B");
    expect(resolve("--color-destructive").toUpperCase()).toBe("#DC2626");
  });

  it("uses the spec's typefaces rather than a generated default", () => {
    expect(resolve("--font-sans")).toMatch(/Inter/);
    expect(resolve("--font-heading")).toMatch(/Plus Jakarta Sans/);
  });

  // A re-run of `npx shadcn add` appends its own theme block. Two declarations of the
  // same token mean the brand value has been shadowed.
  it("declares each brand token exactly once", () => {
    for (const token of ["--primary", "--color-primary", "--font-sans", "--muted-foreground"]) {
      expect(occurrences(token), token).toBe(1);
    }
  });

  // `@import "tailwindcss"` expands in place, so a font import placed after it is no
  // longer a leading @import and every browser drops it silently.
  it("loads the webfonts before Tailwind expands", () => {
    const fontAt = css.indexOf("fonts.googleapis.com");
    const tailwindAt = css.indexOf('@import "tailwindcss"');
    expect(fontAt).toBeGreaterThan(-1);
    expect(fontAt).toBeLessThan(tailwindAt);
  });

  it("enforces the 44px minimum touch target", () => {
    expect(css).toMatch(/min-height:\s*44px/);
  });
});
