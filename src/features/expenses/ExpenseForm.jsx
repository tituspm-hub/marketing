import { useEffect, useRef, useState } from "react";
import { doc, addDoc, updateDoc, collection, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Plus, Check, CornerDownLeft, X } from "lucide-react";
import { db } from "../../lib/firebase.js";
import { parseAmount, MAX_AMOUNT, inr } from "../../lib/format.js";
import { monthKey, isWithinPeriod, defaultDateFor } from "../../lib/period.js";
import { MAX_CATEGORY_LABEL } from "../../lib/category.js";
import { useAuth } from "../../auth/AuthProvider.jsx";

const blank = (date) => ({ description: "", amount: "", date, category: "", invoice: "", notes: "" });
const isOther = (label) => /^other$/i.test(String(label ?? ""));

export default function ExpenseForm({ settings, categories, onAddCategory, editing, onDone }) {
  const { user } = useAuth();
  const { periodStart, periodEnd } = settings;
  const [form, setForm] = useState(() => blank(defaultDateFor(periodStart, periodEnd)));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const newCategoryField = useRef(null);

  useEffect(() => {
    if (editing) {
      setForm({
        description: editing.description ?? "",
        amount: String(editing.amount ?? ""),
        date: editing.date ?? defaultDateFor(periodStart, periodEnd),
        category: editing.category ?? "",
        invoice: editing.invoice ?? "",
        notes: editing.notes ?? "",
      });
      setError("");
      setAddingCategory(false);
    }
  }, [editing, periodStart, periodEnd]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function reset() {
    setForm(blank(defaultDateFor(periodStart, periodEnd)));
    setError("");
    setNewCategory("");
    setAddingCategory(false);
    onDone?.();
  }

  function pick(value) {
    setForm((f) => ({ ...f, category: value }));
    // Choosing Other is how a person says the list is missing their bucket, so that is
    // where naming a new one lives rather than behind a separate control.
    setAddingCategory(isOther(value));
    if (isOther(value)) window.setTimeout(() => newCategoryField.current?.focus(), 0);
  }

  async function addCategory() {
    const result = await onAddCategory(newCategory, user.uid);
    if (!result.ok) return setError(result.reason);
    setForm((f) => ({ ...f, category: result.label }));
    setAddingCategory(false);
    setNewCategory("");
    setError("");
    toast.success(`Added the ${result.label} category`);
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (!form.description.trim()) return setError("Add a short description of the expense.");
    if (form.description.trim().length > 200) return setError("Keep the description under 200 characters.");

    const amount = parseAmount(form.amount);
    if (amount === null) return setError("Amount needs to be a number above zero.");
    if (amount > MAX_AMOUNT) return setError("That amount looks wrong. Check the figure.");
    if (!form.category) return setError("Pick a category.");
    if (!isWithinPeriod(form.date, periodStart, periodEnd)) {
      return setError(`Date must fall inside the tracking period, ${periodStart} to ${periodEnd}.`);
    }

    const payload = {
      description: form.description.trim(),
      amount,
      date: form.date,
      month: monthKey(form.date),
      category: form.category,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    };
    // The rules reject unknown keys, so optional fields are omitted rather than blank.
    if (form.invoice.trim()) payload.invoice = form.invoice.trim();
    if (form.notes.trim()) payload.notes = form.notes.trim();

    setBusy(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "expenses", editing.id), payload);
        toast.success("Expense updated");
      } else {
        await addDoc(collection(db, "expenses"), {
          ...payload,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
        toast.success("Expense added");
      }
      reset();
    } catch (err) {
      setError(err?.code === "permission-denied"
        ? "That expense was refused. Check the date falls inside the tracking period."
        : "Could not save the expense. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const livePreview = parseAmount(form.amount);
  // Guaranteed present: it is the only route to naming a category, so it cannot depend
  // on the seeded list happening to contain it.
  const chips = categories.some(isOther) ? categories : [...categories, "Other"];

  return (
    <form id="expense-form" onSubmit={submit} noValidate
          className="bg-white rounded-card shadow-card p-5 sm:p-6 scroll-mt-6">
      <div className="flex items-center gap-2.5 mb-5">
        <span className="grid place-items-center size-9 rounded-xl bg-accent text-primary shrink-0">
          {editing ? <Check className="size-4" /> : <Plus className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-extrabold leading-tight">
            {editing ? "Edit expense" : "Add an expense"}
          </h2>
          <p className="text-muted-foreground text-xs">
            {editing ? "Changes are visible to everyone." : "Everyone sees it the moment you save."}
          </p>
        </div>
        {!editing && (
          <p className="hidden sm:flex text-[11px] text-muted-foreground items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded border border-line bg-muted font-sans">n</kbd>
            from anywhere
          </p>
        )}
      </div>

      <div className="grid grid-cols-12 gap-x-4 gap-y-1">
        <Field id="description" label="What was it for?" className="col-span-12 lg:col-span-5">
          <input id="description" value={form.description} onChange={set("description")}
                 placeholder="Meta ads — anti-ghosting campaign" maxLength={200} className={input} />
        </Field>
        <Field id="amount" label="Amount" className="col-span-6 sm:col-span-4 lg:col-span-3"
               hint={livePreview !== null ? inr(livePreview) : undefined}>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
            <input id="amount" inputMode="decimal" value={form.amount} onChange={set("amount")}
                   placeholder="25,000" className={`${input} pl-7 tabular`} />
          </div>
        </Field>
        <Field id="date" label="Date" className="col-span-6 sm:col-span-4 lg:col-span-2">
          <input id="date" type="date" value={form.date} onChange={set("date")}
                 min={`${periodStart}-01`} max={`${periodEnd}-31`} className={input} />
        </Field>
        <Field id="invoice" label="Invoice" optional className="col-span-12 sm:col-span-4 lg:col-span-2">
          <input id="invoice" value={form.invoice} onChange={set("invoice")}
                 placeholder="INV-2026-041" maxLength={80} className={input} />
        </Field>
      </div>

      <Field id="category" label="Category" className="mt-1">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="category-label">
          {chips.map((c, i) => {
            const value = c.label ?? c;
            const picked = form.category === value;
            return (
              <button key={value} type="button" data-compact role="radio" aria-checked={picked}
                      onClick={() => pick(value)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        picked ? "border-transparent text-white shadow-sm"
                               : "border-line bg-white text-muted-foreground hover:border-primary hover:text-ink"
                      }`}
                      style={picked ? { background: `var(--color-cat-${(i % 8) + 1})` } : undefined}>
                {value}
              </button>
            );
          })}
        </div>

        {addingCategory && (
          <div className="mt-2.5 rounded-xl border border-dashed border-primary/40 bg-accent/40 p-2.5">
            <div className="flex flex-wrap gap-2">
              <input
                ref={newCategoryField} value={newCategory} maxLength={MAX_CATEGORY_LABEL}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addCategory(); }
                  if (e.key === "Escape") { e.preventDefault(); setAddingCategory(false); }
                }}
                aria-label="New category name" placeholder="Name a new category, e.g. Podcast sponsorships"
                className={`${input} flex-1 min-w-[200px] bg-white`}
              />
              <button type="button" onClick={addCategory} disabled={!newCategory.trim()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-white text-xs font-semibold px-4 disabled:opacity-50">
                <CornerDownLeft className="size-3.5" />
                Add category
              </button>
              <button type="button" data-compact aria-label="Cancel adding a category"
                      onClick={() => setAddingCategory(false)}
                      className="grid place-items-center size-9 rounded-xl border border-line bg-white text-muted-foreground hover:text-ink">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Saved for the whole team. Leave it blank to file this under Other.
            </p>
          </div>
        )}

        {/* The native control stays in the tree so the label, tests and keyboard
            users all still reach a real form field. */}
        <select id="category" value={form.category} onChange={(e) => pick(e.target.value)}
                className="sr-only" tabIndex={-1}>
          <option value="">Choose a category…</option>
          {chips.map((c) => {
            const value = c.label ?? c;
            return <option key={value} value={value}>{value}</option>;
          })}
        </select>
      </Field>

      <Field id="notes" label="Notes" optional>
        <input id="notes" value={form.notes} onChange={set("notes")} maxLength={1000}
               placeholder="Vendor, what it covered, anything worth remembering" className={input} />
      </Field>

      {error && (
        <p role="alert" className="text-danger text-sm mb-4 flex gap-2">
          <span aria-hidden="true">⚠</span><span>{error}</span>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary text-white font-semibold px-7 hover:bg-primary-hover transition-colors disabled:opacity-60 shadow-lift">
          {busy ? "Saving…" : editing ? "Save changes" : "Add expense"}
        </button>
        {editing ? (
          <button type="button" onClick={reset} className="rounded-full border border-line font-semibold px-6">
            Cancel
          </button>
        ) : (
          <p className="text-xs text-muted-foreground self-center ml-1">
            Logged against {form.date || "the selected date"}.
          </p>
        )}
      </div>
    </form>
  );
}

const input =
  "w-full rounded-xl border border-line px-3.5 text-sm outline-none transition-colors " +
  "focus:border-primary placeholder:text-muted-foreground/60";

function Field({ id, label, hint, optional, className = "", children }) {
  return (
    <div className={`mb-4 ${className}`}>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label htmlFor={id} id={`${id}-label`} className="text-sm font-semibold">
          {label}
          {optional && <span className="text-muted-foreground font-medium ml-1.5 text-xs">optional</span>}
        </label>
        {hint && <span className="text-xs text-muted-foreground tabular">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
