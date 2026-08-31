export const MAX_AMOUNT = 100_000_000; // ten crore; also enforced in firestore.rules

const inrFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function inr(value) {
  const n = Number(value);
  return "₹" + inrFormatter.format(Number.isFinite(n) ? n : 0);
}

export function fmtDate(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "—";
  // Reject values the Date constructor silently rolls over, e.g. 2026-13-45.
  if (d.toISOString().slice(0, 10) !== iso) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"'`]/g, (c) => ENTITIES[c]);
}

const SUFFIXES = { k: 1_000, l: 100_000, lakh: 100_000, cr: 10_000_000, crore: 10_000_000 };

export function parseAmount(input) {
  if (typeof input === "number") return finitePositive(input);
  if (typeof input !== "string") return null;
  const cleaned = input.trim().toLowerCase().replace(/[₹,\s]/g, "");
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(k|l|lakh|cr|crore)?$/);
  if (!match) return null;
  const base = Number(match[1]);
  const multiplier = match[2] ? SUFFIXES[match[2]] : 1;
  return finitePositive(base * multiplier);
}

function finitePositive(n) {
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) return null;
  return Math.round(n);
}
