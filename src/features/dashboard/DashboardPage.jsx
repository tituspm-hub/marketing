import { useMemo, useState } from "react";
import { doc, deleteDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "../../lib/firebase.js";
import { inr, fmtDate, parseAmount } from "../../lib/format.js";
import { monthsInPeriod, findMonth, monthKey, defaultDateFor } from "../../lib/period.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useSettings } from "../settings/useSettings.js";
import { useExpenses } from "../expenses/useExpenses.js";
import { useBudgets } from "../expenses/useBudgets.js";
import ExpenseForm from "../expenses/ExpenseForm.jsx";
import FullScreenLoader from "../../components/FullScreenLoader.jsx";

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const { expenses, loading: expensesLoading, error } = useExpenses();
  const { budgets } = useBudgets();

  const months = useMemo(
    () => monthsInPeriod(settings.periodStart, settings.periodEnd),
    [settings.periodStart, settings.periodEnd]
  );
  const [activeMonth, setActiveMonth] = useState(null);
  const [editing, setEditing] = useState(null);

  const current = activeMonth ?? monthKey(defaultDateFor(settings.periodStart, settings.periodEnd));

  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.month === current),
    [expenses, current]
  );
  const spent = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const budget = Number(budgets[current] || 0);
  const remaining = budget - spent;
  const utilisation = budget ? Math.round((spent / budget) * 100) : null;

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const e of monthExpenses) {
      map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  const totalsByMonth = useMemo(() => {
    const map = Object.fromEntries(months.map((m) => [m.key, 0]));
    for (const e of expenses) if (map[e.month] !== undefined) map[e.month] += Number(e.amount || 0);
    return map;
  }, [expenses, months]);

  const grandSpent = Object.values(totalsByMonth).reduce((s, v) => s + v, 0);
  const grandBudget = months.reduce((s, m) => s + Number(budgets[m.key] || 0), 0);

  if (settingsLoading || expensesLoading) return <FullScreenLoader label="Loading the tracker…" />;
  if (error) return <p role="alert" className="text-danger">{error}</p>;

  const label = findMonth(months, current).full;

  async function remove(expense) {
    if (!window.confirm(`Delete "${expense.description}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "expenses", expense.id));
      if (editing?.id === expense.id) setEditing(null);
      toast.success("Expense deleted");
    } catch {
      toast.error("Could not delete that expense.");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold leading-tight">Marketing budget</h1>
        <p className="text-muted-foreground text-sm">
          {months[0]?.full} – {months.at(-1)?.full} · {expenses.length} expenses recorded
        </p>
      </header>

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Month">
        {months.map((m) => (
          <button key={m.key} onClick={() => setActiveMonth(m.key)} data-compact
            aria-current={m.key === current ? "true" : undefined}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold border ${
              m.key === current
                ? "bg-primary text-white border-primary"
                : "bg-white border-line hover:border-primary"
            }`}>
            {m.label}
            <span className="block text-xs font-normal opacity-80 tabular">
              {inr(totalsByMonth[m.key] ?? 0)}
            </span>
          </button>
        ))}
      </nav>

      <section className="grid sm:grid-cols-3 gap-4">
        <Stat label={`Budget · ${label}`} value={budget ? inr(budget) : "Not set"}
              tone={budget ? "ink" : "muted"} />
        <Stat label="Spent" value={inr(spent)}
              hint={utilisation !== null ? `${utilisation}% of budget` : "No budget set"} />
        <Stat label={remaining < 0 ? "Over budget by" : "Remaining"}
              value={inr(Math.abs(remaining))}
              tone={budget && remaining < 0 ? "danger" : budget ? "success" : "muted"} />
      </section>

      {isAdmin && <BudgetEditor monthKey={current} label={label} current={budget} uid={user.uid} />}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <ExpenseForm settings={settings} editing={editing} onDone={() => setEditing(null)} />

        <section className="bg-white rounded-card shadow-card p-6">
          <h2 className="text-lg font-extrabold mb-4">Spend by category · {label}</h2>
          {byCategory.length === 0 ? (
            <Empty>Nothing logged for {label} yet.</Empty>
          ) : (
            <ul className="space-y-3">
              {byCategory.map(([category, amount]) => (
                <li key={category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold">{category}</span>
                    <span className="tabular">{inr(amount)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface overflow-hidden">
                    <div className="h-full bg-primary rounded-full"
                         style={{ width: `${spent ? (amount / spent) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="bg-white rounded-card shadow-card p-6">
        <h2 className="text-lg font-extrabold mb-4">Six-month overview</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-line">
                <th className="py-2 font-semibold">Month</th>
                <th className="py-2 font-semibold text-right">Budget</th>
                <th className="py-2 font-semibold text-right">Spent</th>
                <th className="py-2 font-semibold text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const b = Number(budgets[m.key] || 0);
                const s = totalsByMonth[m.key] ?? 0;
                return (
                  <tr key={m.key} className="border-b border-line last:border-0">
                    <td className="py-2 font-semibold">{m.full}</td>
                    <td className="py-2 text-right tabular">{b ? inr(b) : "—"}</td>
                    <td className="py-2 text-right tabular">{inr(s)}</td>
                    <td className={`py-2 text-right tabular ${b && s > b ? "text-danger" : "text-muted-foreground"}`}>
                      {b ? inr(b - s) : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="font-extrabold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular">{grandBudget ? inr(grandBudget) : "—"}</td>
                <td className="py-2 text-right tabular">{inr(grandSpent)}</td>
                <td className="py-2 text-right tabular">
                  {grandBudget ? inr(grandBudget - grandSpent) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-card shadow-card p-6">
        <h2 className="text-lg font-extrabold mb-4">Expense ledger · {label}</h2>
        {monthExpenses.length === 0 ? (
          <Empty>No expenses for {label}. Add the first one above.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-line">
                  <th className="py-2 font-semibold">Date</th>
                  <th className="py-2 font-semibold">Description</th>
                  <th className="py-2 font-semibold">Category</th>
                  <th className="py-2 font-semibold text-right">Amount</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {monthExpenses.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0 align-top">
                    <td className="py-3 whitespace-nowrap">{fmtDate(e.date)}</td>
                    <td className="py-3">
                      <div className="font-semibold">{e.description}</div>
                      {(e.invoice || e.notes) && (
                        <div className="text-muted-foreground text-xs mt-0.5">
                          {e.invoice && <span>Invoice {e.invoice}</span>}
                          {e.invoice && e.notes && " · "}
                          {e.notes}
                        </div>
                      )}
                    </td>
                    <td className="py-3">{e.category}</td>
                    <td className="py-3 text-right tabular font-semibold">{inr(e.amount)}</td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(e)} data-compact
                              className="text-sm font-semibold px-3 py-1 rounded-full border border-line">
                        Edit
                      </button>{" "}
                      <button onClick={() => remove(e)} data-compact
                              className="text-sm font-semibold px-3 py-1 rounded-full border border-line text-danger">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, tone = "ink" }) {
  const colour = { ink: "text-ink", danger: "text-danger", success: "text-success", muted: "text-muted-foreground" }[tone];
  return (
    <div className="bg-white rounded-card shadow-card p-5">
      <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-extrabold tabular mt-1 ${colour}`}>{value}</div>
      {hint && <div className="text-muted-foreground text-xs mt-1">{hint}</div>}
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-muted-foreground text-sm py-6 text-center">{children}</p>;
}

function BudgetEditor({ monthKey: key, label, current, uid }) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    const amount = draft.trim() === "" ? 0 : parseAmount(draft);
    if (amount === null) return toast.error("Budget needs to be a number.");
    setBusy(true);
    try {
      await setDoc(doc(db, "budgets", key), {
        amount, updatedBy: uid, updatedAt: serverTimestamp(),
      });
      toast.success(`Budget set for ${label}`);
      setOpen(false);
      setDraft("");
    } catch {
      toast.error("Could not save the budget.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => { setOpen(true); setDraft(current ? String(current) : ""); }}
              className="text-sm font-semibold px-5 rounded-full border border-line bg-white">
        {current ? `Change the ${label} budget` : `Set a budget for ${label}`}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-card shadow-card p-5 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-48">
        <label htmlFor="budget" className="block text-sm font-semibold mb-1">
          Budget for {label} (₹)
        </label>
        <input id="budget" inputMode="decimal" value={draft} autoFocus
               onChange={(e) => setDraft(e.target.value)} placeholder="500000"
               className="w-full rounded-full border border-line px-4 tabular outline-none focus:border-primary" />
      </div>
      <button onClick={save} disabled={busy}
              className="rounded-full bg-primary text-white font-semibold px-6 disabled:opacity-60">
        {busy ? "Saving…" : "Save"}
      </button>
      <button onClick={() => setOpen(false)} className="rounded-full border border-line font-semibold px-6">
        Cancel
      </button>
    </div>
  );
}
