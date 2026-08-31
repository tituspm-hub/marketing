import { describe, it, expect } from "vitest";
import { generateTempPassword, validatePassword } from "../src/lib/password.js";

describe("generateTempPassword", () => {
  it("produces a password that passes its own validator", () => {
    for (let i = 0; i < 200; i++) {
      expect(validatePassword(generateTempPassword()).ok).toBe(true);
    }
  });
  it("produces a different password each time", () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateTempPassword()));
    expect(seen.size).toBe(100);
  });
  it("avoids characters that are misread when dictated over chat", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword()).not.toMatch(/[O0Il1]/);
    }
  });
  it("does not end every password with the same characters", () => {
    const tails = new Set(Array.from({ length: 200 }, () => generateTempPassword().slice(-2)));
    expect(tails.size).toBeGreaterThan(1);
  });
  it("varies which position carries the guaranteed digit", () => {
    const positions = new Set(
      Array.from({ length: 200 }, () => generateTempPassword().search(/[0-9]/))
    );
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe("validatePassword", () => {
  it("accepts a strong password", () => {
    expect(validatePassword("Marketing-2026x").ok).toBe(true);
  });
  it("rejects anything under 10 characters", () => {
    expect(validatePassword("Abc-123x").ok).toBe(false);
  });
  it("requires a letter and a digit so a passphrase of one class is refused", () => {
    expect(validatePassword("abcdefghijkl").ok).toBe(false);
    expect(validatePassword("123456789012").ok).toBe(false);
  });
  it("rejects non-strings and empty input without throwing", () => {
    for (const bad of [null, undefined, 12345, ""]) {
      expect(validatePassword(bad).ok).toBe(false);
    }
  });
  it("rejects a password longer than Firebase will accept", () => {
    expect(validatePassword("a1" + "x".repeat(200)).ok).toBe(false);
  });
});
