import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { monthsInPeriod, monthKey, defaultDateFor } from "../../lib/period.js";
import { useSettings } from "../settings/useSettings.js";
import { useExpenses } from "../expenses/useExpenses.js";
import { useBudgets } from "../expenses/useBudgets.js";
import { useCategories } from "../expenses/useCategories.js";

// Overview and Ledger are two screens onto one month. The month lives in the query
// string rather than in either page's state so moving between them keeps it, and a
// link to a particular month is something a person can send to somebody else.
export function useTracker() {
  const { settings, loading: settingsLoading } = useSettings();
  const { expenses, loading: expensesLoading, error } = useExpenses();
  const { budgets } = useBudgets();
  const { categories, addCategory } = useCategories(settings.categories);
  const [params, setParams] = useSearchParams();

  const months = useMemo(
    () => monthsInPeriod(settings.periodStart, settings.periodEnd),
    [settings.periodStart, settings.periodEnd]
  );

  const asked = params.get("m");
  const current = months.some((m) => m.key === asked)
    ? asked
    : monthKey(defaultDateFor(settings.periodStart, settings.periodEnd));

  function setMonth(key) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("m", key);
      return next;
    }, { replace: true });
  }

  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.month === current), [expenses, current]);

  const spent = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const budget = Number(budgets[current] || 0);
  const used = budget ? Math.round((spent / budget) * 100) : null;

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const e of monthExpenses) {
      map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  const totals = useMemo(() => {
    const map = Object.fromEntries(months.map((m) => [m.key, 0]));
    for (const e of expenses) if (map[e.month] !== undefined) map[e.month] += Number(e.amount || 0);
    return map;
  }, [expenses, months]);

  return {
    settings, months, current, setMonth, params, setParams,
    expenses, monthExpenses, budgets, budget, spent, remaining: budget - spent, used,
    byCategory, totals, categories, addCategory,
    loading: settingsLoading || expensesLoading, error,
  };
}
