import { inr } from "../../lib/format.js";

// The month selector doubles as the six-month picture: each segment carries its own
// spend-against-budget meter, so switching months is not the only way to see the shape
// of the period. This replaces both the cramped pills and a separate overview table.
export default function MonthRail({ months, active, onSelect, totals, budgets }) {
  return (
    <div
      role="tablist"
      aria-label="Month"
      className="grid grid-cols-3 sm:grid-cols-6 gap-2 p-2 rounded-card bg-white shadow-card"
    >
      {months.map((m) => {
        const spent = totals[m.key] ?? 0;
        const budget = Number(budgets[m.key] || 0);
        const pct = budget ? Math.min((spent / budget) * 100, 100) : 0;
        const over = budget > 0 && spent > budget;
        const isActive = m.key === active;

        return (
          <button
            key={m.key}
            role="tab"
            aria-selected={isActive}
            data-compact
            onClick={() => onSelect(m.key)}
            className={`group text-left px-3 py-2.5 rounded-xl transition-all ${
              isActive
                ? "bg-primary text-white shadow-lift"
                : "hover:bg-muted"
            }`}
          >
            <div className={`text-[10px] font-bold tracking-[0.12em] ${
              isActive ? "text-white/70" : "text-muted-foreground"
            }`}>
              {m.label.toUpperCase()}
            </div>
            <div className="text-sm font-extrabold tabular mt-0.5">{inr(spent)}</div>
            <div className={`h-1 rounded-full mt-2 overflow-hidden ${
              isActive ? "bg-white/25" : "bg-muted"
            }`}>
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  isActive ? "bg-white" : over ? "bg-danger" : "bg-primary"
                }`}
                style={{ width: `${budget ? pct : 0}%` }}
              />
            </div>
            <div className={`text-[10px] mt-1.5 ${isActive ? "text-white/70" : "text-muted-foreground"}`}>
              {budget ? `${Math.round((spent / budget) * 100)}% of ${inr(budget)}` : "No budget"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
