// Categories come from two places: the seeded list on /settings/app, and the ones
// people add themselves in /categories. Both reach the picker through here so the
// two sources can never disagree about spelling, order, or duplicates.

export const MAX_CATEGORY_LABEL = 60;

// The id is derived from the label rather than generated, so the same name typed by
// two people on the same afternoon lands on one document instead of two chips that
// look identical. Firestore path segments cannot contain / or be all dots.
export function categoryId(label) {
  return String(label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_CATEGORY_LABEL);
}

const labelOf = (c) => (typeof c === "string" ? c : c?.label);

export function normaliseCategory(input, existing = []) {
  const label = String(input ?? "").trim().replace(/\s+/g, " ");
  if (!label) return { ok: false, reason: "Give the category a name." };
  if (label.length > MAX_CATEGORY_LABEL) {
    return { ok: false, reason: `Keep it under ${MAX_CATEGORY_LABEL} characters.` };
  }
  const id = categoryId(label);
  if (!id) return { ok: false, reason: "Use at least one letter or number." };

  const taken = existing.some((c) => categoryId(labelOf(c)) === id);
  if (taken) return { ok: false, reason: `${label} is already a category.` };

  return { ok: true, label, id };
}

// Seeded categories keep their curated order; added ones follow alphabetically, so a
// new one appears in a predictable place rather than jumping to the front of the row.
export function mergeCategories(seeded = [], added = []) {
  const out = [];
  const seen = new Set();
  const push = (value) => {
    const label = labelOf(value);
    if (typeof label !== "string" || !label.trim()) return;
    const id = categoryId(label);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(label);
  };

  for (const c of seeded) push(c);
  const extra = [...added].filter(Boolean).sort((a, b) =>
    String(labelOf(a) ?? "").localeCompare(String(labelOf(b) ?? "")));
  for (const c of extra) push(c);
  return out;
}
