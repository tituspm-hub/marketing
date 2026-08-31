import { useEffect, useState } from "react";
import { doc, addDoc, updateDoc, collection, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "../../lib/firebase.js";
import { parseAmount, MAX_AMOUNT } from "../../lib/format.js";
import { monthKey, isWithinPeriod, defaultDateFor } from "../../lib/period.js";
import { useAuth } from "../../auth/AuthProvider.jsx";

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

  return (
    <form onSubmit={submit} noValidate className="bg-white rounded-card shadow-card p-6">
      <h2 className="text-lg font-extrabold mb-4">
        {editing ? "Edit expense" : "Add an expense"}
      </h2>

      <Field id="description" label="What was it for?">
        <input id="description" value={form.description} onChange={set("description")}
               placeholder="e.g. Meta ads — anti-ghosting campaign"
               className="w-full rounded-full border border-line px-4 outline-none focus:border-primary" />
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field id="amount" label="Amount (₹)">
          <input id="amount" inputMode="decimal" value={form.amount} onChange={set("amount")}
                 placeholder="25000"
                 className="w-full rounded-full border border-line px-4 tabular outline-none focus:border-primary" />
        </Field>
        <Field id="date" label="Date">
          <input id="date" type="date" value={form.date} onChange={set("date")}
                 min={`${periodStart}-01`} max={`${periodEnd}-31`}
                 className="w-full rounded-full border border-line px-4 outline-none focus:border-primary" />
        </Field>
      </div>

      <Field id="category" label="Category">
        <select id="category" value={form.category} onChange={set("category")}
                className="w-full rounded-full border border-line px-4 outline-none focus:border-primary">
          <option value="">Choose a category…</option>
          {categories.map((c) => (
            <option key={c.id ?? c} value={c.label ?? c}>{c.label ?? c}</option>
          ))}
        </select>
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field id="invoice" label="Invoice no. (optional)">
          <input id="invoice" value={form.invoice} onChange={set("invoice")} placeholder="INV-2026-041"
                 className="w-full rounded-full border border-line px-4 outline-none focus:border-primary" />
        </Field>
        <Field id="notes" label="Notes (optional)">
          <input id="notes" value={form.notes} onChange={set("notes")}
                 placeholder="Context, vendor, what it covered…"
                 className="w-full rounded-full border border-line px-4 outline-none focus:border-primary" />
        </Field>
      </div>

      {error && (
        <p role="alert" className="text-danger text-sm mb-4 flex gap-2">
          <span aria-hidden="true">⚠</span><span>{error}</span>
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={busy}
                className="rounded-full bg-primary text-white font-semibold px-6 disabled:opacity-60">
          {busy ? "Saving…" : editing ? "Save changes" : "Add expense"}
        </button>
        {editing && (
          <button type="button" onClick={reset}
                  className="rounded-full border border-line font-semibold px-6">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ id, label, children }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-semibold mb-1">{label}</label>
      {children}
    </div>
  );
}
