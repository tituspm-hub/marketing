import { useEffect, useState } from "react";
import { doc, addDoc, updateDoc, collection, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "../../lib/firebase.js";
import { parseAmount, MAX_AMOUNT, inr } from "../../lib/format.js";
import { monthKey, isWithinPeriod, defaultDateFor } from "../../lib/period.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { Plus, Check, Command } from "lucide-react";

const blank = (date) => ({ description: "", amount: "", date, category: "", invoice: "", notes: "" });

export default function ExpenseForm({ settings, editing, onDone }) {
  const { user } = useAuth();
  const { periodStart, periodEnd, categories } = settings;
  const [form, setForm] = useState(() => blank(defaultDateFor(periodStart, periodEnd)));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
    }
  }, [editing, periodStart, periodEnd]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function reset() {
    setForm(blank(defaultDateFor(periodStart, periodEnd)));
    setError("");
    onDone?.();
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

  return (
    <form onSubmit={submit} noValidate className="bg-white rounded-card shadow-card p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <span className="grid place-items-center size-9 rounded-xl bg-accent text-primary shrink-0">
          {editing ? <Check className="size-4" /> : <Plus className="size-4" />}
        </span>
        <div className="min-w-0">
          <h2 className="font-extrabold leading-tight">
            {editing ? "Edit expense" : "Add an expense"}
          </h2>
          <p className="text-muted-foreground text-xs">
            {editing ? "Changes are visible to everyone." : "Everyone sees it straight away."}
          </p>
        </div>
      </div>

      <Field id="description" label="What was it for?">
        <input id="description" value={form.description} onChange={set("description")}
               placeholder="Meta ads — anti-ghosting campaign" maxLength={200}
               className={input} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="amount" label="Amount"
               hint={livePreview !== null ? inr(livePreview) : undefined}>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
            <input id="amount" inputMode="decimal" value={form.amount} onChange={set("amount")}
                   placeholder="25,000" className={`${input} pl-7 tabular`} />
          </div>
        </Field>
        <Field id="date" label="Date">
          <input id="date" type="date" value={form.date} onChange={set("date")}
                 min={`${periodStart}-01`} max={`${periodEnd}-31`} className={input} />
        </Field>
      </div>

      <Field id="category" label="Category">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="category-label">
          {categories.map((c, i) => {
            const value = c.label ?? c;
            const picked = form.category === value;
            return (
              <button key={value} type="button" data-compact
                      role="radio" aria-checked={picked}
                      onClick={() => setForm((f) => ({ ...f, category: value }))}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        picked
                          ? "border-transparent text-white"
                          : "border-line bg-white text-muted-foreground hover:border-primary hover:text-ink"
                      }`}
                      style={picked ? { background: `var(--color-cat-${(i % 8) + 1})` } : undefined}>
                {value}
              </button>
            );
          })}
        </div>
        {/* The native control stays in the tree so the label, tests and keyboard
            users all still reach a real form field. */}
        <select id="category" value={form.category} onChange={set("category")} className="sr-only" tabIndex={-1}>
          <option value="">Choose a category…</option>
          {categories.map((c) => {
            const value = c.label ?? c;
            return <option key={value} value={value}>{value}</option>;
          })}
        </select>
      </Field>

      <details className="mb-4 group">
        <summary className="text-sm font-semibold text-muted-foreground hover:text-ink list-none flex items-center gap-1.5">
          <span className="transition-transform group-open:rotate-90">›</span>
          Invoice and notes
        </summary>
        <div className="grid grid-cols-1 gap-3 mt-3">
          <Field id="invoice" label="Invoice number">
            <input id="invoice" value={form.invoice} onChange={set("invoice")}
                   placeholder="INV-2026-041" maxLength={80} className={input} />
          </Field>
          <Field id="notes" label="Notes">
            <textarea id="notes" value={form.notes} onChange={set("notes")} rows={2}
                      placeholder="Vendor, what it covered, anything worth remembering"
                      maxLength={1000} className={`${input} py-2.5 resize-none`} />
          </Field>
        </div>
      </details>

      {error && (
        <p role="alert" className="text-danger text-sm mb-4 flex gap-2">
          <span aria-hidden="true">⚠</span><span>{error}</span>
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={busy}
                className="flex-1 rounded-full bg-primary text-white font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60 shadow-lift">
          {busy ? "Saving…" : editing ? "Save changes" : "Add expense"}
        </button>
        {editing && (
          <button type="button" onClick={reset}
                  className="rounded-full border border-line font-semibold px-5">
            Cancel
          </button>
        )}
      </div>

      {!editing && (
        <p className="text-[11px] text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded border border-line bg-muted font-sans">n</kbd>
          from anywhere jumps here
        </p>
      )}
    </form>
  );
}

const input =
  "w-full rounded-xl border border-line px-3.5 text-sm outline-none transition-colors " +
  "focus:border-primary placeholder:text-muted-foreground/60";

function Field({ id, label, hint, children }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label htmlFor={id} id={`${id}-label`} className="text-sm font-semibold">{label}</label>
        {hint && <span className="text-xs text-muted-foreground tabular">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
