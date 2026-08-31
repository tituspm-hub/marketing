import { describe, it, expect } from "vitest";
import { USERNAME_DOMAIN, validateUsername, toAuthEmail, fromAuthEmail } from "../src/lib/username.js";

describe("validateUsername", () => {
  it("accepts the team's usernames", () => {
    for (const u of ["yash", "titus", "gebin", "shijin", "madesh", "a.b_c-d"]) {
      expect(validateUsername(u).ok).toBe(true);
    }
  });
  it("rejects uppercase, so there is exactly one spelling of each name", () => {
    expect(validateUsername("Yash")).toEqual({ ok: false, reason: expect.stringMatching(/lowercase/i) });
  });
  it("rejects names shorter than 3 or longer than 20 characters", () => {
    expect(validateUsername("ab").ok).toBe(false);
    expect(validateUsername("a".repeat(21)).ok).toBe(false);
  });
  it("requires the first character to be a letter", () => {
    expect(validateUsername("1abc").ok).toBe(false);
    expect(validateUsername(".abc").ok).toBe(false);
  });
  it("rejects spaces, at-signs, and other punctuation", () => {
    for (const u of ["ya sh", "ya@sh", "ya/sh", "ya+sh"]) {
      expect(validateUsername(u).ok).toBe(false);
    }
  });
  it("rejects reserved words", () => {
    for (const u of ["admin", "root", "system", "support", "api", "null", "firebase"]) {
      expect(validateUsername(u)).toEqual({ ok: false, reason: expect.stringMatching(/reserved/i) });
    }
  });
  it("rejects non-strings without throwing", () => {
    expect(validateUsername(null).ok).toBe(false);
    expect(validateUsername(undefined).ok).toBe(false);
  });
});

describe("toAuthEmail", () => {
  it("appends the synthetic domain", () => {
    expect(toAuthEmail("yash")).toBe(`yash@${USERNAME_DOMAIN}`);
  });
  it("trims and lowercases what the user typed", () => {
    expect(toAuthEmail("  Yash  ")).toBe(`yash@${USERNAME_DOMAIN}`);
  });
  it("throws rather than building an address from an invalid username", () => {
    expect(() => toAuthEmail("ya sh")).toThrow();
  });
});

describe("fromAuthEmail", () => {
  it("recovers the username", () => {
    expect(fromAuthEmail(`shijin@${USERNAME_DOMAIN}`)).toBe("shijin");
  });
  it("returns null for an address outside the synthetic domain", () => {
    expect(fromAuthEmail("someone@gmail.com")).toBeNull();
    expect(fromAuthEmail(null)).toBeNull();
  });
});
