// Dependency-free period-derivation helpers. No imports from Firebase, React, or
// any package — this module must remain pure and trivially testable.
//
// Fixes two catalogued spec defects:
//   #1 unguarded month lookup (`MONTHS.find(...).full` could throw on an
//      out-of-range month) — `findMonth` here never returns undefined.
//   #2 hardcoded date-window clamp in the old `todayISO()` — the tracking
//      period is now derived from caller-supplied settings (start/end month
//      keys), not a baked-in range.

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MONTHS = 120;

const LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthKey(isoDate) {
  if (typeof isoDate !== "string" || !DATE_RE.test(isoDate)) return null;
  return isoDate.slice(0, 7);
}

function toIndex(key) {
  if (typeof key !== "string" || !MONTH_RE.test(key)) return null;
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
}

function fromIndex(index) {
  const y = Math.floor(index / 12);
  const m = index % 12;
  return {
    key: `${y}-${String(m + 1).padStart(2, "0")}`,
    label: LABELS[m],
    full: `${FULL[m]} ${y}`,
  };
}

export function monthsInPeriod(start, end) {
  const a = toIndex(start);
  const b = toIndex(end);
  if (a === null || b === null || b < a) return [];
  const count = Math.min(b - a + 1, MAX_MONTHS);
  return Array.from({ length: count }, (_, i) => fromIndex(a + i));
}

export function findMonth(months, key) {
  const hit = (Array.isArray(months) ? months : []).find((m) => m.key === key);
  if (hit) return hit;
  const index = toIndex(key);
  // Never return undefined; the previous implementation crashed on `.full`
  // at render time when the active month fell outside the known list.
  return index === null
    ? { key: String(key), label: String(key), full: String(key) }
    : fromIndex(index);
}

export function isWithinPeriod(isoDate, start, end) {
  const key = monthKey(isoDate);
  if (!key || !MONTH_RE.test(start || "") || !MONTH_RE.test(end || "")) return false;
  return key >= start && key <= end;
}

// Local-components ISO date, deliberately not `toISOString()`. `defaultDateFor`
// answers "what day is it for the person typing right now", which is inherently
// local — using the UTC date here would silently pick the wrong day after local
// evening in any UTC-ahead zone (ruling R3; the same class of silent-default
// defect as spec failure point #2). Contrast with `fmtDate` in format.js, which
// formats a stored calendar date and stays UTC on purpose so it renders
// identically for everyone; that asymmetry is intentional, not a bug.
function localISODate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function defaultDateFor(start, end, now = new Date()) {
  const today = localISODate(now);
  if (isWithinPeriod(today, start, end)) return today;
  const key = monthKey(today);
  if (key && key < start) return `${start}-01`;
  return `${end}-01`;
}
