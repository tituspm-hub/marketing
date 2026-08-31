import { describe, it, expect } from "vitest";
import {
  monthKey, monthsInPeriod, findMonth, isWithinPeriod, defaultDateFor,
} from "../src/lib/period.js";

describe("monthKey", () => {
  it("takes the year and month from an ISO date", () => {
    expect(monthKey("2026-08-12")).toBe("2026-08");
  });
  it("returns null for malformed input instead of a broken slice", () => {
    expect(monthKey("")).toBeNull();
    expect(monthKey("12/08/2026")).toBeNull();
    expect(monthKey(null)).toBeNull();
  });
});

describe("monthsInPeriod", () => {
  it("enumerates inclusive months across a year boundary", () => {
    const months = monthsInPeriod("2026-08", "2027-01");
    expect(months).toHaveLength(6);
    expect(months[0]).toEqual({ key: "2026-08", label: "Aug", full: "August 2026" });
    expect(months[5]).toEqual({ key: "2027-01", label: "Jan", full: "January 2027" });
  });
  it("returns a single month when start equals end", () => {
    expect(monthsInPeriod("2026-08", "2026-08")).toHaveLength(1);
  });
  it("returns empty for an inverted or malformed period rather than looping forever", () => {
    expect(monthsInPeriod("2027-01", "2026-08")).toEqual([]);
    expect(monthsInPeriod("nonsense", "2027-01")).toEqual([]);
    expect(monthsInPeriod(undefined, undefined)).toEqual([]);
  });
  it("caps the period at 120 months so bad settings cannot hang the app", () => {
    expect(monthsInPeriod("2000-01", "2099-12")).toHaveLength(120);
  });
});

describe("findMonth", () => {
  const months = monthsInPeriod("2026-08", "2027-01");
  it("finds a month inside the period", () => {
    expect(findMonth(months, "2026-09").full).toBe("September 2026");
  });
  it("returns a usable fallback instead of undefined for an unknown key", () => {
    const fallback = findMonth(months, "2030-05");
    expect(fallback).toBeDefined();
    expect(fallback.key).toBe("2030-05");
    expect(typeof fallback.full).toBe("string");
  });
  it("survives an empty month list", () => {
    expect(findMonth([], "2026-08").key).toBe("2026-08");
  });
});

describe("isWithinPeriod", () => {
  it("includes both boundaries", () => {
    expect(isWithinPeriod("2026-08-01", "2026-08", "2027-01")).toBe(true);
    expect(isWithinPeriod("2027-01-31", "2026-08", "2027-01")).toBe(true);
  });
  it("excludes dates outside the period", () => {
    expect(isWithinPeriod("2026-07-31", "2026-08", "2027-01")).toBe(false);
    expect(isWithinPeriod("2027-02-01", "2026-08", "2027-01")).toBe(false);
  });
  it("rejects malformed dates", () => {
    expect(isWithinPeriod("garbage", "2026-08", "2027-01")).toBe(false);
  });
});

// Ruling R3b: the brief's fixtures pass a UTC instant (new Date("...Z")). Once
// defaultDateFor reads LOCAL date components (ruling R3, to fix spec defect #2 —
// silently defaulting to the wrong day), that UTC fixture resolves to a different
// calendar day in zones ahead of UTC (e.g. 15 Sep 10:00Z is already 16 Sep in
// UTC+14), which would make the brief's own expected values fail there. These
// fixtures are built from local date components instead, so they mean the same
// calendar day everywhere the suite runs. Expected values are unchanged from the brief.
describe("defaultDateFor", () => {
  it("uses today when today falls inside the period", () => {
    const now = new Date(2026, 8, 15, 10, 0, 0); // 15 Sep 2026, local
    expect(defaultDateFor("2026-08", "2027-01", now)).toBe("2026-09-15");
  });
  it("falls back to the first day of the period when today is before it", () => {
    const now = new Date(2026, 4, 2, 10, 0, 0); // 2 May 2026, local
    expect(defaultDateFor("2026-08", "2027-01", now)).toBe("2026-08-01");
  });
  it("falls back to the first day of the last month when today is after it", () => {
    const now = new Date(2028, 3, 2, 10, 0, 0); // 2 Apr 2028, local
    expect(defaultDateFor("2026-08", "2027-01", now)).toBe("2027-01-01");
  });
  // Ruling R3: proves defaultDateFor reads the LOCAL calendar day, not the UTC one.
  // Under the old `now.toISOString().slice(0, 10)` approach, 23:00 local in a
  // UTC-ahead zone (e.g. IST, UTC+5:30) is already the next UTC day, so the old
  // logic would silently report the wrong date late in the evening — exactly the
  // class of defect spec failure point #2 exists to eliminate.
  it("returns the local calendar day even late in the evening in a UTC-ahead zone", () => {
    const now = new Date(2026, 8, 15, 23, 0, 0); // 23:00 local, 15 Sep 2026
    expect(defaultDateFor("2026-08", "2027-01", now)).toBe("2026-09-15");
  });
});
