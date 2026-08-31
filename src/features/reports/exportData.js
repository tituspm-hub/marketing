import { inr, fmtDate, escapeHtml } from "../../lib/format.js";

const COLUMNS = ["date", "month", "category", "description", "amount", "invoice", "notes"];

// Excel reads a leading =, +, - or @ in a cell as a formula. Prefixing with a quote
// keeps the value visible and inert.
function cell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(expenses) {
  const rows = expenses.map((e) => COLUMNS.map((c) => cell(e[c])).join(","));
  return [COLUMNS.join(","), ...rows].join("\r\n");
}

export function parseCsv(text) {
  const lines = String(text ?? "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { ok: false, reason: "That file has no rows under its header." };

  const header = splitRow(lines[0]).map((h) => h.trim().toLowerCase());
  for (const required of ["date", "category", "description", "amount"]) {
    if (!header.includes(required)) {
      return { ok: false, reason: `The file needs a "${required}" column.` };
    }
  }

  const rows = [];
  for (const [index, line] of lines.slice(1).entries()) {
    const values = splitRow(line);
    const row = Object.fromEntries(header.map((h, i) => [h, (values[i] ?? "").trim()]));
    if (!row.description || !row.date) {
      return { ok: false, reason: `Row ${index + 2} is missing a date or a description.` };
    }
    rows.push(row);
  }
  return { ok: true, rows };
}

function splitRow(line) {
  const out = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { out.push(field); field = ""; }
    else field += char;
  }
  out.push(field);
  return out;
}

export function download(filename, text, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoked on the next tick: released immediately, Safari cancels the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A print-ready report. The browser's own "Save as PDF" is the export: no dependency,
// and the reader gets the paper size and margins they already prefer.
export function reportHtml({ label, expenses, budget, spent, byCategory, months, totals, budgets }) {
  const rows = expenses.map((e) => `
    <tr>
      <td>${escapeHtml(fmtDate(e.date))}</td>
      <td>${escapeHtml(e.description)}</td>
      <td>${escapeHtml(e.category)}</td>
      <td>${escapeHtml(e.invoice ?? "")}</td>
      <td class="num">${escapeHtml(inr(e.amount))}</td>
    </tr>`).join("");

  const categories = byCategory.map(([name, amount]) => `
    <tr><td>${escapeHtml(name)}</td><td class="num">${escapeHtml(inr(amount))}</td>
    <td class="num">${spent ? Math.round((amount / spent) * 100) : 0}%</td></tr>`).join("");

  const overview = months.map((m) => {
    const b = Number(budgets[m.key] || 0);
    const s = totals[m.key] ?? 0;
    return `<tr><td>${escapeHtml(m.full)}</td><td class="num">${b ? escapeHtml(inr(b)) : "—"}</td>
      <td class="num">${escapeHtml(inr(s))}</td>
      <td class="num">${b ? escapeHtml(inr(b - s)) : "—"}</td></tr>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Marketing spend — ${escapeHtml(label)}</title>
<style>
  @page { margin: 18mm; }
  body { font: 12px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #0B1220; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .1em; color: #64748B;
       margin: 26px 0 8px; }
  .sub { color: #64748B; margin: 0 0 20px; }
  .cards { display: flex; gap: 10px; margin-bottom: 8px; }
  .card { flex: 1; border: 1px solid #E7EBF3; border-radius: 10px; padding: 12px; }
  .card span { display: block; font-size: 10px; letter-spacing: .1em; color: #64748B; }
  .card strong { font-size: 18px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; letter-spacing: .08em; color: #64748B;
       border-bottom: 1px solid #E7EBF3; padding: 6px 4px; }
  td { padding: 6px 4px; border-bottom: 1px solid #F1F5F9; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; border-top: 2px solid #0B1220; border-bottom: none; }
</style></head><body>
<h1>Marketing spend</h1>
<p class="sub">${escapeHtml(label)} · generated ${escapeHtml(fmtDate(new Date().toISOString().slice(0, 10)))}</p>
<div class="cards">
  <div class="card"><span>BUDGET</span><strong>${budget ? escapeHtml(inr(budget)) : "Not set"}</strong></div>
  <div class="card"><span>SPENT</span><strong>${escapeHtml(inr(spent))}</strong></div>
  <div class="card"><span>${spent > budget && budget ? "OVER BY" : "REMAINING"}</span>
    <strong>${budget ? escapeHtml(inr(Math.abs(budget - spent))) : "—"}</strong></div>
</div>
<h2>Spend by category</h2>
<table><thead><tr><th>Category</th><th class="num">Amount</th><th class="num">Share</th></tr></thead>
<tbody>${categories || '<tr><td colspan="3">Nothing logged.</td></tr>'}</tbody></table>
<h2>Expense ledger</h2>
<table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Invoice</th>
<th class="num">Amount</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5">Nothing logged.</td></tr>'}</tbody>
<tfoot><tr><td colspan="4">Total</td><td class="num">${escapeHtml(inr(spent))}</td></tr></tfoot></table>
<h2>Period overview</h2>
<table><thead><tr><th>Month</th><th class="num">Budget</th><th class="num">Spent</th>
<th class="num">Difference</th></tr></thead><tbody>${overview}</tbody></table>
</body></html>`;
}
