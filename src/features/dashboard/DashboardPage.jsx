import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { TrendingUp, PiggyBank, Plus, Printer, ArrowRight } from "lucide-react";
import { inr } from "../../lib/format.js";
import { findMonth } from "../../lib/period.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useTracker } from "./useTracker.js";
import ExpenseForm from "../expenses/ExpenseForm.jsx";
import { useNewExpenseShortcut, focusExpenseForm } from "../expenses/useNewExpenseShortcut.js";
import MonthRail from "./MonthRail.jsx";
import StatCard from "./StatCard.jsx";
import BudgetCard from "./BudgetCard.jsx";
import Tour from "../../components/Tour.jsx";
import FullScreenLoader from "../../components/FullScreenLoader.jsx";
import { reportHtml, printHtml } from "../reports/exportData.js";

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const tracker = useTracker();
  const {
    settings, months, current, setMonth, expenses, monthExpenses, budgets, budget,
    spent, remaining, used, byCategory, totals, categories, addCategory,
    loading, error, params, setParams,
  } = tracker;

  const [editing, setEditing] = useState(null);

  useNewExpenseShortcut(focusExpenseForm);

  // The Ledger tab hands work back here through the query string: ?new=1 to log one,
  // ?edit=<id> to correct one. Each is cleared once acted on so a refresh does not
  // repeat it, and the form only exists to scroll to once loading is done.
  const editId = params.get("edit");
  const wantsNew = params.get("new");

  const clearIntent = useCallback((key) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(key);
      return next;
    }, { replace: true });
  }, [setParams]);

  useEffect(() => {
    if (!wantsNew || loading) return;
    clearIntent("new");
    focusExpenseForm();
  }, [wantsNew, loading, clearIntent]);

  useEffect(() => {
    if (!editId || loading) return;
    const found = expenses.find((e) => e.id === editId);
    // An empty list here means the stream has not arrived yet, not that the expense is
    // gone. Holding the parameter is what stops the edit being dropped on the way over.
    if (!found) {
      if (expenses.length === 0) return;
      clearIntent("edit");
      toast.error("That expense is no longer there.");
      return;
    }
    setEditing(found);
    clearIntent("edit");
    focusExpenseForm();
  }, [editId, loading, expenses, clearIntent]);

  const onAddCategory = useCallback(
    (label, uid) => addCategory(label, uid), [addCategory]);

  if (loading) return <FullScreenLoader label="Loading the tracker…" />;
  if (error) return <p role="alert" className="text-danger">{error}</p>;

  const label = findMonth(months, current).full;
  const index = months.findIndex((m) => m.key === current);
  const previousBudget = index > 0 ? Number(budgets[months[index - 1].key] || 0) : 0;

  function printReport() {
    printHtml(reportHtml({ label, expenses: monthExpenses, budget, spent, byCategory, months, totals, budgets }));
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.14em] text-primary">
            {months[0]?.full.toUpperCase()} — {months.at(-1)?.full.toUpperCase()}
          </p>
          <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-tight mt-1">
            Marketing budget
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {monthExpenses.length} {monthExpenses.length === 1 ? "expense" : "expenses"} in {label} ·{" "}
            <span className="tabular font-semibold text-ink">{inr(spent)}</span>
            <Link to={{ pathname: "/ledger", search: `?m=${current}` }}
                  className="text-primary font-semibold ml-2 hover:underline inline-flex items-center gap-1">
              Open the ledger
              <ArrowRight className="size-3.5" />
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap gap-2" data-tour="actions">
          <button onClick={printReport}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-white text-sm font-semibold px-4 hover:border-primary hover:text-primary transition-colors">
            <Printer className="size-4" />
            Report
          </button>
          <button onClick={focusExpenseForm}
                  className="inline-flex items-center gap-2 rounded-full bg-primary text-white font-semibold px-5 hover:bg-primary-hover transition-colors shadow-lift">
            <Plus className="size-4" />
            New expense
          </button>
        </div>
      </header>

      <div data-tour="months">
        <MonthRail months={months} active={current} onSelect={setMonth}
                   totals={totals} budgets={budgets} />
      </div>

      <section className="grid sm:grid-cols-3 gap-4" data-tour="stats">
        <BudgetCard monthKey={current} label={label} amount={budget}
                    previous={previousBudget} canEdit={isAdmin} uid={user.uid} />
        <StatCard eyebrow="Spent" icon={TrendingUp} value={inr(spent)} meter={used ?? 0}
                  tone={used > 100 ? "danger" : "ink"}
                  hint={used !== null ? `${used}% of the budget used` : "No budget to compare against"} />
        <StatCard eyebrow={remaining < 0 ? "Over budget by" : "Remaining"} icon={PiggyBank}
                  value={budget ? inr(Math.abs(remaining)) : "—"}
                  tone={budget && remaining < 0 ? "danger" : budget ? "success" : "muted"}
                  hint={budget && remaining < 0 ? "Spending has passed the budget." : undefined} />
      </section>

      <div data-tour="form">
        <ExpenseForm settings={settings} categories={categories} onAddCategory={onAddCategory}
                     editing={editing} onDone={() => setEditing(null)} />
      </div>

      <Tour />
    </div>
  );
}
