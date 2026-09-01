import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, deleteDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Plus, Download, Upload, Printer } from "lucide-react";
import { db } from "../../lib/firebase.js";
import { inr } from "../../lib/format.js";
import { findMonth } from "../../lib/period.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useTracker } from "../dashboard/useTracker.js";
import { useNewExpenseShortcut } from "../expenses/useNewExpenseShortcut.js";
import MonthRail from "../dashboard/MonthRail.jsx";
import CategoryBreakdown from "../dashboard/CategoryBreakdown.jsx";
import ExpenseLedger from "../expenses/ExpenseLedger.jsx";
import ImportDialog from "../expenses/ImportDialog.jsx";
import FullScreenLoader from "../../components/FullScreenLoader.jsx";
import { toCsv, download, reportHtml, printHtml } from "../reports/exportData.js";

// Every expense in the month, and every way of reading them. It is its own page rather
// than a panel on the overview so the table gets the width and the height it needs.
export default function LedgerPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    settings, months, current, setMonth, monthExpenses, budgets, budget, spent,
    byCategory, totals, categories, loading, error,
  } = useTracker();

  const [view, setView] = useState("ledger");
  const [importing, setImporting] = useState(false);

  // The form lives on the overview. Sending the intent through the query string keeps
  // one form in the app rather than a second copy that can drift from the first.
  const newExpense = () => navigate({ pathname: "/", search: `?m=${current}&new=1` });
  useNewExpenseShortcut(newExpense);

  if (loading) return <FullScreenLoader label="Loading the ledger…" />;
  if (error) return <p role="alert" className="text-danger">{error}</p>;

  const label = findMonth(months, current).full;

  async function remove(expense) {
    if (!window.confirm(`Delete "${expense.description}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "expenses", expense.id));
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
    printHtml(reportHtml({ label, expenses: monthExpenses, budget, spent, byCategory, months, totals, budgets }));
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.14em] text-primary">LEDGER</p>
          <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-tight mt-1">
            {label}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {monthExpenses.length} {monthExpenses.length === 1 ? "expense" : "expenses"} ·{" "}
            <span className="tabular font-semibold text-ink">{inr(spent)}</span>
            {budget > 0 && <> of {inr(budget)} budgeted</>}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <GhostButton onClick={() => setImporting(true)} icon={Upload}>Import</GhostButton>
          <GhostButton onClick={exportCsv} icon={Download}>Export CSV</GhostButton>
          <GhostButton onClick={printReport} icon={Printer}>Report</GhostButton>
          <button onClick={newExpense}
                  className="inline-flex items-center gap-2 rounded-full bg-primary text-white font-semibold px-5 hover:bg-primary-hover transition-colors shadow-lift">
            <Plus className="size-4" />
            New expense
          </button>
        </div>
      </header>

      <MonthRail months={months} active={current} onSelect={setMonth}
                 totals={totals} budgets={budgets} />

      <section className="bg-white rounded-card shadow-card p-5 sm:p-6 min-w-0">
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

        <h2 className="sr-only">
          {view === "ledger" ? `Expense ledger · ${label}` : `Spend by category · ${label}`}
        </h2>

        {view === "ledger" ? (
          <ExpenseLedger
            expenses={monthExpenses} categories={categories}
            onEdit={(e) => navigate({ pathname: "/", search: `?m=${current}&edit=${e.id}` })}
            onDelete={remove}
            emptyAction={
              <button onClick={newExpense}
                      className="inline-flex items-center gap-2 rounded-full bg-primary text-white font-semibold px-5">
                <Plus className="size-4" /> Log the first expense
              </button>
            }
          />
        ) : (
          <CategoryBreakdown byCategory={byCategory} total={spent} label={label} />
        )}
      </section>

      <ImportDialog open={importing} onClose={() => setImporting(false)}
                    settings={settings} categories={categories} uid={user.uid} />
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
