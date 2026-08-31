import { describe, it, expect } from "vitest";
import { toCsv, parseCsv, reportHtml } from "../src/features/reports/exportData.js";

const rows = [
  { date: "2026-09-14", month: "2026-09", category: "Meta Ads", description: "Sprint",
    amount: 45000, invoice: "INV-1", notes: "" },
];

describe("toCsv", () => {
  it("writes a header and one row per expense", () => {
    const csv = toCsv(rows);
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toMatch(/^date,month,category,description,amount,invoice,notes/);
  });
  it("quotes a value containing a comma so columns do not shift", () => {
    const csv = toCsv([{ ...rows[0], description: "Ads, plural" }]);
    expect(csv).toContain('"Ads, plural"');
    expect(parseCsv(csv).rows[0].description).toBe("Ads, plural");
  });
  it("escapes an embedded quote", () => {
    const csv = toCsv([{ ...rows[0], description: 'The "big" push' }]);
    expect(parseCsv(csv).rows[0].description).toBe('The "big" push');
  });
  it("neutralises a leading = so Excel does not run it as a formula", () => {
    const csv = toCsv([{ ...rows[0], description: "=1+1" }]);
    expect(csv).toContain("\"'=1+1\"");
  });
});

describe("parseCsv", () => {
  it("round-trips what toCsv produced", () => {
    const parsed = parseCsv(toCsv(rows));
    expect(parsed.ok).toBe(true);
    expect(parsed.rows[0]).toMatchObject({ category: "Meta Ads", amount: "45000" });
  });
  it("names the missing column rather than failing vaguely", () => {
    expect(parseCsv("date,description\n2026-09-01,x")).toEqual({
      ok: false, reason: expect.stringMatching(/category/),
    });
  });
  it("names the row that is incomplete", () => {
    const result = parseCsv("date,category,description,amount\n2026-09-01,Meta,,100");
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/row 2/i) });
  });
  it("rejects a file with only a header", () => {
    expect(parseCsv("date,category,description,amount").ok).toBe(false);
  });
  it("rejects empty and non-string input without throwing", () => {
    for (const bad of ["", null, undefined, 42]) expect(parseCsv(bad).ok).toBe(false);
  });
});

describe("reportHtml", () => {
  const base = { label: "September 2026", expenses: rows, budget: 100000, spent: 45000,
                 byCategory: [["Meta Ads", 45000]], months: [], totals: {}, budgets: {} };

  it("escapes a description so a report cannot carry script into the print window", () => {
    const html = reportHtml({ ...base, expenses: [{ ...rows[0], description: "<script>alert(1)</script>" }] });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("states the period and the totals", () => {
    const html = reportHtml(base);
    expect(html).toContain("September 2026");
    expect(html).toMatch(/Expense ledger/);
  });
});
