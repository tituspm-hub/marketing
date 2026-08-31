import { useEffect, useMemo, useState } from "react";
import { doc, deleteDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Wallet, TrendingUp, PiggyBank, Plus, Download, Printer, Upload } from "lucide-react";
import { db } from "../../lib/firebase.js";
import { inr, parseAmount } from "../../lib/format.js";
import { monthsInPeriod, findMonth, monthKey, defaultDateFor } from "../../lib/period.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useSettings } from "../settings/useSettings.js";
import { useExpenses } from "../expenses/useExpenses.js";
import { useBudgets } from "../expenses/useBudgets.js";
import ExpenseForm from "../expenses/ExpenseForm.jsx";
import ExpenseLedger from "../expenses/ExpenseLedger.jsx";
import ImportDialog from "../expenses/ImportDialog.jsx";
import MonthRail from "./MonthRail.jsx";
import StatCard from "./StatCard.jsx";
import CategoryBreakdown from "./CategoryBreakdown.jsx";
import Tour from "../../components/Tour.jsx";
import FullScreenLoader from "../../components/FullScreenLoader.jsx";
import { toCsv, download, reportHtml } from "../reports/exportData.js";

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
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState("ledger");

  const current = activeMonth ?? monthKey(defaultDateFor(settings.periodStart, settings.periodEnd));

  const monthExpenses = useMemo(() => expenses.filter((e) => e.month === current), [expenses, current]);
  const spent = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const budget = Number(budgets[current] || 0);
  const remaining = budget - spent;
  const used = budget ? Math.round((spent / budget) * 100) : null;

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const e of monthExpenses) map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount || 0));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  const totals = useMemo(() => {
    const map = Object.fromEntries(months.map((m) => [m.key, 0]));
    for (const e of expenses) if (map[e.month] !== undefined) map[e.month] += Number(e.amount || 0);
    return map;
  }, [expenses, months]);

  // Press n anywhere to start a new expense, the one action logged many times a day.
  useEffect(() => {
    function onKey(event) {
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if (event.key === "n" && !inField && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        document.getElementById("description")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  function exportCsv() {
    download(`marketing-spend-${current}.csv`, toCsv(monthExpenses));
    toast.success(`Exported ${monthExpenses.length} expenses`);
  }

  function printReport() {
    const html = reportHtml({ label, expenses: monthExpenses, budget, spent, byCategory, months, totals, budgets });
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    frame.contentDocument.write(html);
    frame.contentDocument.close();
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.14em] text-primary">
            {months[0]?.full.toUpperCase()} — {months.at(-1)?.full.toUpperCase()}
          </p>
          <h1 className="text-[32px] leading-[1.1] font-extrabold tracking-tight mt-1">
            Marketing budget
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {expenses.length} {expenses.length === 1 ? "expense" : "expenses"} across the period ·{" "}
            <span className="tabular font-semibold text-ink">
              {inr(Object.values(totals).reduce((s, v) => s + v, 0))}
            </span>{" "}
            committed
          </p>
        </div>

        <div className="flex flex-wrap gap-2" data-tour="actions">
          <GhostButton onClick={() => setImporting(true)} icon={Upload}>Import</GhostButton>
          <GhostButton onClick={exportCsv} icon={Download}>Export CSV</GhostButton>
          <GhostButton onClick={printReport} icon={Printer}>Report</GhostButton>
          <button
            onClick={() => document.getElementById("description")?.focus()}
            className="inline-flex items-center gap-2 rounded-full bg-primary text-white font-semibold px-5 hover:bg-primary-hover transition-colors shadow-lift"
          >
            <Plus className="size-4" />
            New expense
          </button>
        </div>
      </header>

      <div data-tour="months">
        <MonthRail months={months} active={current} onSelect={setActiveMonth}
                   totals={totals} budgets={budgets} />
      </div>

      <section className="grid sm:grid-cols-3 gap-4" data-tour="stats">
        <StatCard eyebrow={`Budget · ${label}`} icon={Wallet}
                  value={budget ? inr(budget) : "Not set"} tone={budget ? "ink" : "muted"}
                  hint={budget ? undefined : isAdmin ? "Set one below to track against it." : "An owner sets this."} />
        <StatCard eyebrow="Spent" icon={TrendingUp} value={inr(spent)} meter={used ?? 0}
                  tone={used > 100 ? "danger" : "ink"}
                  hint={used !== null ? `${used}% of the budget used` : "No budget to compare against"} />
        <StatCard eyebrow={remaining < 0 ? "Over budget by" : "Remaining"} icon={PiggyBank}
                  value={budget ? inr(Math.abs(remaining)) : "—"}
                  tone={budget && remaining < 0 ? "danger" : budget ? "success" : "muted"}
                  hint={budget && remaining < 0 ? "Spending has passed the budget." : undefined} />
      </section>

      {isAdmin && <BudgetEditor monthKey={current} label={label} current={budget} uid={user.uid} />}

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6 items-start">
        <section className="bg-white rounded-card shadow-card p-6 min-w-0">
          <div className="flex items-center gap-1 mb-5 p-1 rounded-xl bg-muted w-fit" role="tablist">
            {[["ledger", "Ledger"], ["categories", "By category"]].map(([id, text]) => (
              <button key={id} role="tab" aria-selected={view === id} data-compact
                      onClick={() => setView(id)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        view === id ? "bg-white text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
                      }`}>
                {text}
              </button>
            ))}
          </div>

          <h2 className="sr-only">{view === "ledger" ? `Expense ledger · ${label}` : `Spend by category · ${label}`}</h2>

          {view === "ledger" ? (
            <ExpenseLedger
              expenses={monthExpenses} categories={settings.categories}
              onEdit={setEditing} onDelete={remove}
              emptyAction={
                <button onClick={() => document.getElementById("description")?.focus()}
                        className="inline-flex items-center gap-2 rounded-full bg-primary text-white font-semibold px-5">
                  <Plus className="size-4" /> Log the first expense
                </button>
              }
            />
          ) : (
            <CategoryBreakdown byCategory={byCategory} total={spent} label={label} />
          )}
        </section>

        <div className="lg:sticky lg:top-8" data-tour="form">
          <ExpenseForm settings={settings} editing={editing} onDone={() => setEditing(null)} />
        </div>
      </div>

      <ImportDialog open={importing} onClose={() => setImporting(false)} settings={settings} uid={user.uid} />
      <Tour />
    </div>
  );
}

function GhostButton({ children, onClick, icon: Icon }) {
  return (
    <button onClick={onClick}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white text-sm font-semibold px-4 hover:border-primary hover:text-primary transition-colors">
      <Icon className="size-4" />
      {children}
    </button>
  );
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
      await setDoc(doc(db, "budgets", key), { amount, updatedBy: uid, updatedAt: serverTimestamp() });
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
              className="inline-flex items-center gap-2 text-sm font-semibold px-5 rounded-full border border-line bg-white hover:border-primary hover:text-primary transition-colors">
        <Wallet className="size-4" />
        {current ? `Change the ${label} budget` : `Set a budget for ${label}`}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-card shadow-card p-5 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[200px]">
        <label htmlFor="budget" className="block text-sm font-semibold mb-1.5">Budget for {label}</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
          <input id="budget" inputMode="decimal" value={draft} autoFocus
                 onChange={(e) => setDraft(e.target.value)} placeholder="5,00,000"
                 className="w-full rounded-xl border border-line pl-8 pr-4 tabular outline-none focus:border-primary" />
        </div>
      </div>
      <button onClick={save} disabled={busy}
              className="rounded-full bg-primary text-white font-semibold px-6 disabled:opacity-60">
        {busy ? "Saving…" : "Save budget"}
      </button>
      <button onClick={() => setOpen(false)} className="rounded-full border border-line font-semibold px-6">
        Cancel
      </button>
    </div>
  );
}
