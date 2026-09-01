import { useMemo, useState } from "react";
import { Search, Pencil, Trash2, X } from "lucide-react";
import { inr, fmtDate } from "../../lib/format.js";

const SORTS = {
  "date-desc": { label: "Newest first", fn: (a, b) => (a.date < b.date ? 1 : -1) },
  "date-asc": { label: "Oldest first", fn: (a, b) => (a.date > b.date ? 1 : -1) },
  "amount-desc": { label: "Largest amount", fn: (a, b) => Number(b.amount) - Number(a.amount) },
  "amount-asc": { label: "Smallest amount", fn: (a, b) => Number(a.amount) - Number(b.amount) },
  "description": { label: "Description A–Z", fn: (a, b) => String(a.description).localeCompare(String(b.description)) },
  "category": { label: "Category A–Z", fn: (a, b) => String(a.category).localeCompare(String(b.category)) },
};

export default function ExpenseLedger({ expenses, categories, onEdit, onDelete, emptyAction }) {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("date-desc");

  const shown = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return expenses
      .filter((e) => !category || e.category === category)
      .filter((e) => !needle || [e.description, e.category, e.invoice, e.notes]
        .some((v) => String(v ?? "").toLowerCase().includes(needle)))
      .sort((SORTS[sort] ?? SORTS["date-desc"]).fn);
  }, [expenses, term, category, sort]);

  const total = shown.reduce((s, e) => s + Number(e.amount || 0), 0);
  const narrowed = Boolean(term.trim() || category);

  function clear() {
    setTerm("");
    setCategory("");
    setSort("date-desc");
  }

  if (expenses.length === 0) {
    return (
      <Empty
        title="No expenses this month"
        body="Log the first one and it appears here straight away, for everyone."
        action={emptyAction}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search description, category, invoice or notes"
            aria-label="Search expenses"
            className="w-full rounded-xl border border-line bg-white pl-10 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category"
                className="rounded-xl border border-line bg-white px-3 text-sm font-medium outline-none focus:border-primary">
          <option value="">All categories</option>
          {categories.map((c) => {
            const label = c.label ?? c;
            return <option key={label} value={label}>{label}</option>;
          })}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort expenses"
                className="rounded-xl border border-line bg-white px-3 text-sm font-medium outline-none focus:border-primary">
          {Object.entries(SORTS).map(([value, { label }]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {narrowed && (
          <button type="button" onClick={clear}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary transition-colors">
            <X className="size-3.5" />
            Clear
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Showing <span className="tabular font-semibold text-ink">{shown.length}</span>
        {narrowed && <> of {expenses.length}</>}{" "}
        {expenses.length === 1 ? "expense" : "expenses"} ·{" "}
        <span className="tabular font-semibold text-ink">{inr(total)}</span>
      </p>

      {shown.length === 0 ? (
        <Empty title="Nothing matches that" body="Try a different word, or clear the filters."
               action={
                 <button type="button" onClick={clear}
                         className="rounded-full border border-line bg-white font-semibold px-5">
                   Clear filters
                 </button>
               } />
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-line">
                {["Date", "Description", "Category"].map((h) => (
                  <th key={h} className="py-2 px-1 text-[10px] font-bold tracking-[0.1em] text-muted-foreground">
                    {h.toUpperCase()}
                  </th>
                ))}
                <th className="py-2 px-1 text-right text-[10px] font-bold tracking-[0.1em] text-muted-foreground">
                  AMOUNT
                </th>
                <th className="py-2 px-1 w-24" />
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="group border-b border-line last:border-0 hover:bg-muted/60 transition-colors">
                  <td className="py-3 px-1 whitespace-nowrap text-muted-foreground">{fmtDate(e.date)}</td>
                  <td className="py-3 px-1">
                    <div className="font-semibold">{e.description}</div>
                    {(e.invoice || e.notes) && (
                      <div className="text-muted-foreground text-xs mt-0.5">
                        {e.invoice && <span>Invoice {e.invoice}</span>}
                        {e.invoice && e.notes && " · "}
                        {e.notes}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-1">
                    <span className="inline-block px-2.5 py-1 rounded-full bg-accent text-primary text-xs font-semibold whitespace-nowrap">
                      {e.category}
                    </span>
                  </td>
                  <td className="py-3 px-1 text-right tabular font-extrabold whitespace-nowrap">{inr(e.amount)}</td>
                  <td className="py-3 px-1">
                    <div className="flex justify-end gap-1 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity">
                      <IconButton label={`Edit ${e.description}`} onClick={() => onEdit(e)}><Pencil className="size-4" /></IconButton>
                      <IconButton label={`Delete ${e.description}`} danger onClick={() => onDelete(e)}><Trash2 className="size-4" /></IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IconButton({ children, label, onClick, danger }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={label} title={label} data-compact
      className={`grid place-items-center size-8 rounded-lg border border-line bg-white transition-colors ${
        danger ? "text-danger hover:bg-danger hover:text-white hover:border-danger"
               : "text-muted-foreground hover:bg-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ title, body, action }) {
  return (
    <div className="text-center py-14 px-6">
      <p className="font-extrabold">{title}</p>
      <p className="text-muted-foreground text-sm mt-1 max-w-xs mx-auto">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
