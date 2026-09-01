import { describe, it, expect } from "vitest";
import { categoryId, normaliseCategory, mergeCategories, MAX_CATEGORY_LABEL }
  from "../src/lib/category.js";

describe("categoryId", () => {
  it("derives one id from a label however it is typed", () => {
    for (const written of ["Podcast sponsorships", "  podcast   Sponsorships ", "PODCAST-SPONSORSHIPS"]) {
      expect(categoryId(written)).toBe("podcast-sponsorships");
    }
  });
  it("drops punctuation rather than encoding it into the path", () => {
    expect(categoryId("Tools & Software")).toBe("tools-software");
    expect(categoryId("Events / Campus")).toBe("events-campus");
  });
  it("never returns a path segment Firestore refuses", () => {
    for (const written of ["a/b", "..", ".", "__proto__"]) {
      const id = categoryId(written);
      expect(id).not.toContain("/");
      expect(id).not.toMatch(/^\.+$/);
    }
  });
  it("returns an empty id when nothing usable survives", () => {
    expect(categoryId("!!!")).toBe("");
    expect(categoryId("   ")).toBe("");
  });
});

describe("normaliseCategory", () => {
  it("accepts a plain label and collapses its whitespace", () => {
    expect(normaliseCategory("  Podcast   sponsorships ", [])).toEqual({
      ok: true, label: "Podcast sponsorships", id: "podcast-sponsorships",
    });
  });
  it("rejects an empty label", () => {
    expect(normaliseCategory("   ", []).ok).toBe(false);
  });
  it("rejects a label the rules would refuse for length", () => {
    expect(normaliseCategory("x".repeat(MAX_CATEGORY_LABEL + 1), []).ok).toBe(false);
    expect(normaliseCategory("x".repeat(MAX_CATEGORY_LABEL), []).ok).toBe(true);
  });
  it("rejects a label with no letters or digits, which has no id", () => {
    expect(normaliseCategory("***", []).ok).toBe(false);
  });
  it("rejects one that already exists, whatever the casing", () => {
    const result = normaliseCategory("meta ADS", ["Meta Ads", "Google Ads"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already/i);
  });
});

describe("mergeCategories", () => {
  it("keeps the seeded order and appends the added ones alphabetically", () => {
    const merged = mergeCategories(
      [{ label: "Meta Ads" }, { label: "Other" }],
      [{ id: "webinars", label: "Webinars" }, { id: "podcast", label: "Podcast" }]
    );
    expect(merged).toEqual(["Meta Ads", "Other", "Podcast", "Webinars"]);
  });
  it("accepts plain strings as well as objects, as the settings document has both", () => {
    expect(mergeCategories(["Meta Ads"], [])).toEqual(["Meta Ads"]);
  });
  it("never lists the same label twice", () => {
    expect(mergeCategories([{ label: "Meta Ads" }], [{ id: "meta-ads", label: "Meta Ads" }]))
      .toEqual(["Meta Ads"]);
  });
  it("survives a malformed document rather than blanking the picker", () => {
    expect(mergeCategories([{ label: "Meta Ads" }], [{ id: "x" }, null, { label: "" }]))
      .toEqual(["Meta Ads"]);
  });
});
