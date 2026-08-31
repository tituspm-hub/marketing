import { describe, it, expect } from "vitest";
import { inr, fmtDate, escapeHtml, parseAmount } from "../src/lib/format.js";

describe("inr", () => {
  it("uses Indian digit grouping and drops decimals", () => {
    expect(inr(2500000)).toBe("₹25,00,000");
    expect(inr(1000)).toBe("₹1,000");
  });
  it("renders every non-finite input as zero rather than NaN", () => {
    for (const bad of [null, undefined, NaN, Infinity, -Infinity, "abc"]) {
      expect(inr(bad)).toBe("₹0");
    }
  });
});

describe("fmtDate", () => {
  it("formats an ISO date as day and short month", () => {
    expect(fmtDate("2026-08-12")).toBe("12 Aug");
  });
  it("returns an em dash for empty or unparseable input", () => {
    expect(fmtDate("")).toBe("—");
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("not-a-date")).toBe("—");
    expect(fmtDate("2026-13-45")).toBe("—");
  });
  it("formats the same date regardless of the machine's timezone", () => {
    const original = process.env.TZ;
    for (const tz of ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      expect(fmtDate("2026-08-12")).toBe("12 Aug");
    }
    process.env.TZ = original;
  });
});

describe("escapeHtml", () => {
  it("escapes every character that can break out of markup or an attribute", () => {
    expect(escapeHtml(`<b>"x" 'y' & \`z\``)).toBe(
      "&lt;b&gt;&quot;x&quot; &#39;y&#39; &amp; &#96;z&#96;"
    );
  });
  it("escapes the ampersand first so entities are not double-broken", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
  it("coerces non-strings without throwing", () => {
    expect(escapeHtml(null)).toBe("null");
    expect(escapeHtml(42)).toBe("42");
  });
});

describe("parseAmount", () => {
  it("accepts plain, grouped, and symbol-prefixed numbers", () => {
    expect(parseAmount("25000")).toBe(25000);
    expect(parseAmount("25,000")).toBe(25000);
    expect(parseAmount("₹25,000")).toBe(25000);
    expect(parseAmount(25000)).toBe(25000);
  });
  it("expands Indian shorthand suffixes", () => {
    expect(parseAmount("25k")).toBe(25000);
    expect(parseAmount("1.2L")).toBe(120000);
    expect(parseAmount("1.5cr")).toBe(15000000);
  });
  it("rejects anything that is not a positive finite number", () => {
    for (const bad of ["", "abc", "-5", "0", "Infinity", "1e400", null, undefined, {}]) {
      expect(parseAmount(bad)).toBeNull();
    }
  });
  it("rejects amounts above the ten crore ceiling", () => {
    expect(parseAmount("100000001")).toBeNull();
  });
});
