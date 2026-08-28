import React, { useState, useEffect, useMemo } from "react";

// ---------- constants ----------
const PALETTE = {
  paper: "#F6F1E7",
  card: "#FFFFFF",
  ink: "#141311",
  grey: "#8A8577",
  line: "#E4DCC9",
  yellow: "#F3A712",
  yellowSoft: "#FBE3B2",
  blue: "#2547D0",
  pink: "#E8336E",
  red: "#CC2A1E",
  redSoft: "#FBDDD9",
  green: "#1E7A46",
};

const MONTHS = [
  { key: "2026-08", label: "Aug", full: "August 2026" },
  { key: "2026-09", label: "Sep", full: "September 2026" },
  { key: "2026-10", label: "Oct", full: "October 2026" },
  { key: "2026-11", label: "Nov", full: "November 2026" },
  { key: "2026-12", label: "Dec", full: "December 2026" },
  { key: "2027-01", label: "Jan", full: "January 2027" },
];

const CATEGORIES = [
  "Meta Ads",
  "Google Ads",
  "Influencer",
  "Freelancer & Agency",
  "Content Production",
  "Tools & Software",
  "Events & Campus",
  "Other",
];

const STORAGE_KEY = "hire3x-marketing-budget-v1";

// Browser storage shim (replaces Claude artifact storage for the hosted version)
const storage = {
  async get(key) {
    const v = localStorage.getItem(key);
    return v !== null ? { value: v } : null;
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key };
  },
};

const inr = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const todayISO = () => {
  const t = new Date();
  const lo = new Date("2026-08-01");
  const hi = new Date("2027-01-31");
  const d = t < lo ? lo : t > hi ? hi : t;
  return d.toISOString().slice(0, 10);
};

const emptyForm = () => ({
  id: null,
  description: "",
  amount: "",
  date: todayISO(),
  category: CATEGORIES[0],
  invoice: "",
  notes: "",
});

// ---------- component ----------
export default function MarketingBudgetTracker() {
  const [expenses, setExpenses] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [activeMonth, setActiveMonth] = useState(() => {
    const now = new Date().toISOString().slice(0, 7);
    return MONTHS.some((m) => m.key === now) ? now : "2026-08";
  });
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle");
  const [budgetDraft, setBudgetDraft] = useState("");
  const [editingBudget, setEditingBudget] = useState(false);
  const [formError, setFormError] = useState("");

  // ---------- load ----------
  useEffect(() => {
    (async () => {
      try {
        const result = await storage.get(STORAGE_KEY);
        if (result && result.value) {
          const data = JSON.parse(result.value);
          setExpenses(Array.isArray(data.expenses) ? data.expenses : []);
          setBudgets(
            data.budgets && typeof data.budgets === "object" ? data.budgets : {}
          );
        }
      } catch (e) {
        // no saved data yet — start fresh
      }
      setLoading(false);
    })();
  }, []);

  // ---------- persist ----------
  const persist = async (nextExpenses, nextBudgets) => {
    setSaveState("saving");
    try {
      const result = await storage.set(
        STORAGE_KEY,
        JSON.stringify({ expenses: nextExpenses, budgets: nextBudgets })
      );
      setSaveState(result ? "idle" : "error");
    } catch (e) {
      setSaveState("error");
    }
  };

  // ---------- derived ----------
  const monthExpenses = useMemo(
    () =>
      expenses
        .filter((e) => (e.date || "").slice(0, 7) === activeMonth)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [expenses, activeMonth]
  );

  const monthTotal = monthExpenses.reduce(
    (s, e) => s + Number(e.amount || 0),
    0
  );
  const monthBudget = Number(budgets[activeMonth] || 0);
  const remaining = monthBudget - monthTotal;
  const isOver = monthBudget > 0 && monthTotal > monthBudget;
  const utilization = monthBudget
    ? Math.round((monthTotal / monthBudget) * 100)
    : null;

  const byCategory = useMemo(() => {
    const map = {};
    monthExpenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + Number(e.amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  const totalsByMonth = useMemo(() => {
    const map = {};
    MONTHS.forEach((m) => (map[m.key] = 0));
    expenses.forEach((e) => {
      const k = (e.date || "").slice(0, 7);
      if (map[k] !== undefined) map[k] += Number(e.amount || 0);
    });
    return map;
  }, [expenses]);

  const grandTotal = Object.values(totalsByMonth).reduce((s, v) => s + v, 0);
  const grandBudget = MONTHS.reduce(
    (s, m) => s + Number(budgets[m.key] || 0),
    0
  );

  // ---------- actions ----------
  const submitExpense = () => {
    setFormError("");
    if (!form.description.trim()) {
      setFormError("Add a short description of the expense.");
      return;
    }
    const amt = Number(form.amount);
    if (!amt || amt <= 0) {
      setFormError("Amount needs to be a number above zero.");
      return;
    }
    if (!form.date || form.date < "2026-08-01" || form.date > "2027-01-31") {
      setFormError("Date must fall between 1 Aug 2026 and 31 Jan 2027.");
      return;
    }

    let next;
    if (form.id) {
      next = expenses.map((e) =>
        e.id === form.id ? { ...form, amount: amt } : e
      );
    } else {
      next = [
        ...expenses,
        { ...form, id: "exp_" + Date.now(), amount: amt, createdAt: Date.now() },
      ];
    }
    setExpenses(next);
    persist(next, budgets);
    setActiveMonth(form.date.slice(0, 7));
    setForm(emptyForm());
  };

  const editExpense = (e) => {
    setForm({ ...e, amount: String(e.amount) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteExpense = (id) => {
    const next = expenses.filter((e) => e.id !== id);
    setExpenses(next);
    persist(next, budgets);
    if (form.id === id) setForm(emptyForm());
  };

  const saveBudget = () => {
    const amt = Number(budgetDraft);
    const next = { ...budgets, [activeMonth]: amt > 0 ? amt : 0 };
    setBudgets(next);
    persist(expenses, next);
    setEditingBudget(false);
  };

  // ---------- report ----------
  const generateReport = () => {
    const m = MONTHS.find((x) => x.key === activeMonth);
    const mIdx = MONTHS.findIndex((x) => x.key === activeMonth);
    const prevM = mIdx > 0 ? MONTHS[mIdx - 1] : null;

    const rows = monthExpenses.slice().sort((a, b) => (a.date > b.date ? 1 : -1));
    const count = rows.length;
    const avg = count ? monthTotal / count : 0;
    const largest = rows.slice().sort((a, b) => b.amount - a.amount)[0];
    const top5 = rows.slice().sort((a, b) => b.amount - a.amount).slice(0, 5);
    const topCat = byCategory[0];

    // previous month comparison
    const prevExpenses = prevM
      ? expenses.filter((e) => (e.date || "").slice(0, 7) === prevM.key)
      : [];
    const prevTotal = prevExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const prevByCat = {};
    prevExpenses.forEach((e) => {
      prevByCat[e.category] = (prevByCat[e.category] || 0) + Number(e.amount || 0);
    });
    const momChange =
      prevM && prevTotal > 0
        ? Math.round(((monthTotal - prevTotal) / prevTotal) * 100)
        : null;

    // ---- executive summary sentences ----
    const sentences = [];
    sentences.push(
      `Marketing spend for ${m.full} totalled <strong>${inr(monthTotal)}</strong> across ${count} recorded expense${count === 1 ? "" : "s"}.`
    );
    if (monthBudget > 0) {
      if (isOver) {
        sentences.push(
          `This <strong style="color:${PALETTE.red}">exceeded the allocated budget of ${inr(monthBudget)} by ${inr(monthTotal - monthBudget)}</strong> (${utilization}% utilisation).`
        );
      } else {
        sentences.push(
          `This is <strong>${utilization}%</strong> of the allocated budget of ${inr(monthBudget)}, leaving ${inr(remaining)} unspent.`
        );
      }
    } else {
      sentences.push(`No budget was allocated for this month.`);
    }
    if (topCat) {
      sentences.push(
        `The largest area of spend was <strong>${topCat[0]}</strong> at ${inr(topCat[1])} — ${Math.round((topCat[1] / monthTotal) * 100)}% of the month.`
      );
    }
    if (momChange !== null) {
      sentences.push(
        momChange >= 0
          ? `Spend was <strong>up ${momChange}%</strong> versus ${prevM.full} (${inr(prevTotal)}).`
          : `Spend was <strong>down ${Math.abs(momChange)}%</strong> versus ${prevM.full} (${inr(prevTotal)}).`
      );
    }
    if (largest) {
      sentences.push(
        `The single largest expense was “${escapeHtml(largest.description)}” at ${inr(largest.amount)} on ${fmtDate(largest.date)}.`
      );
    }

    // ---- category table with MoM delta ----
    const catRows = byCategory
      .map(([cat, amt]) => {
        const pct = monthTotal ? Math.round((amt / monthTotal) * 100) : 0;
        const prev = prevByCat[cat] || 0;
        let delta = "—";
        if (prevM && prev > 0) {
          const ch = Math.round(((amt - prev) / prev) * 100);
          delta =
            ch >= 0
              ? `<span style="color:${PALETTE.red}">▲ ${ch}%</span>`
              : `<span style="color:${PALETTE.green}">▼ ${Math.abs(ch)}%</span>`;
        } else if (prevM && prev === 0 && amt > 0) {
          delta = `<span style="color:${PALETTE.grey}">new</span>`;
        }
        return `<tr>
          <td>${cat}</td>
          <td class="num">${inr(amt)}</td>
          <td class="num">${pct}%</td>
          <td class="num">${delta}</td>
          <td><div class="bar"><div class="fill" style="width:${pct}%"></div></div></td>
        </tr>`;
      })
      .join("");

    // ---- six-month overview ----
    const overviewRows = MONTHS.map((mm) => {
      const b = Number(budgets[mm.key] || 0);
      const t = totalsByMonth[mm.key];
      const v = b - t;
      const cur = mm.key === activeMonth;
      let status = "—";
      if (b > 0 && t > b)
        status = `<span class="pill over">Over by ${inr(t - b)}</span>`;
      else if (b > 0 && t > 0)
        status = `<span class="pill ok">${Math.round((t / b) * 100)}% used</span>`;
      else if (b > 0) status = `<span class="pill idle">Not started</span>`;
      else if (t > 0) status = `<span class="pill idle">No budget set</span>`;
      return `<tr${cur ? ' class="current"' : ""}>
        <td>${mm.full}${cur ? " ◂" : ""}</td>
        <td class="num">${b ? inr(b) : "—"}</td>
        <td class="num">${t ? inr(t) : "—"}</td>
        <td class="num" style="color:${b > 0 && v < 0 ? PALETTE.red : PALETTE.ink}">${b ? inr(v) : "—"}</td>
        <td>${status}</td>
      </tr>`;
    }).join("");

    // ---- top 5 expenses ----
    const topRows = top5
      .map(
        (e, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(e.description)}</td>
        <td>${e.category}</td>
        <td>${fmtDate(e.date)}</td>
        <td class="num">${inr(e.amount)}</td>
        <td class="num">${monthTotal ? Math.round((e.amount / monthTotal) * 100) : 0}%</td>
      </tr>`
      )
      .join("");

    // ---- full ledger ----
    const expRows = rows
      .map(
        (e) => `<tr>
        <td>${fmtDate(e.date)}</td>
        <td>${escapeHtml(e.description)}</td>
        <td>${e.category}</td>
        <td>${e.invoice ? escapeHtml(e.invoice) : "—"}</td>
        <td class="num">${inr(e.amount)}</td>
        <td class="notes">${e.notes ? escapeHtml(e.notes) : ""}</td>
      </tr>`
      )
      .join("");

    const budgetBar =
      monthBudget > 0
        ? `<div class="budgetbar">
             <div class="spent" style="width:${Math.min(utilization, 100)}%"></div>
             ${isOver ? `<div class="overflow" style="width:${Math.min(utilization - 100, 100)}%"></div>` : ""}
           </div>
           <div class="budgetlabels">
             <span>${inr(monthTotal)} spent</span>
             <span>${isOver ? `<strong style="color:${PALETTE.red}">${inr(monthTotal - monthBudget)} over</strong>` : `${inr(remaining)} left`} · budget ${inr(monthBudget)}</span>
           </div>`
        : "";

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Marketing Expense Report — ${m.full}</title>
<style>
  body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#141311;background:#F6F1E7;margin:0;padding:48px}
  .sheet{max-width:860px;margin:0 auto;background:#fff;padding:48px;border:1px solid #E4DCC9}
  .eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8A8577;margin-bottom:8px}
  h1{font-size:30px;margin:0 0 4px;font-weight:800}
  h1 mark{background:${PALETTE.yellow};padding:0 6px}
  .period{color:#8A8577;margin-bottom:24px}
  .stats{display:flex;gap:36px;border-top:2px solid #141311;border-bottom:1px solid #E4DCC9;padding:16px 0;margin-bottom:20px;flex-wrap:wrap}
  .stat .label{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A8577;margin-bottom:4px}
  .stat .val{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
  .val.ok{color:${PALETTE.green}}.val.over{color:${PALETTE.red}}
  .budgetbar{display:flex;height:14px;background:#F1EBDD;margin:6px 0 4px;overflow:hidden}
  .budgetbar .spent{background:${PALETTE.yellow}}
  .budgetbar .overflow{background:${PALETTE.red}}
  .budgetlabels{display:flex;justify-content:space-between;font-size:12px;color:#8A8577;margin-bottom:24px}
  .summary{font-size:14.5px;line-height:1.7;background:#FBF8F1;border-left:4px solid ${PALETTE.yellow};padding:16px 20px;margin-bottom:8px}
  .alert{background:${PALETTE.redSoft};border-left:4px solid ${PALETTE.red};padding:14px 18px;font-size:14px;margin:16px 0;color:${PALETTE.red};font-weight:600}
  h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;margin:36px 0 12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8A8577;padding:8px 10px;border-bottom:2px solid #141311}
  td{padding:9px 10px;border-bottom:1px solid #EFE9DA;vertical-align:top}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  td.notes{color:#8A8577;font-size:12px;max-width:180px}
  tr.current td{background:#FBF8F1;font-weight:600}
  .bar{background:#F1EBDD;height:10px;width:110px}
  .fill{background:${PALETTE.yellow};height:10px}
  .pill{font-size:11px;padding:2px 8px;font-weight:700;white-space:nowrap}
  .pill.over{background:${PALETTE.redSoft};color:${PALETTE.red}}
  .pill.ok{background:#E5F0E8;color:${PALETTE.green}}
  .pill.idle{background:#F1EBDD;color:#8A8577}
  .foot{margin-top:40px;font-size:11px;color:#8A8577}
  @media print{body{background:#fff;padding:0}.sheet{border:none;padding:24px}}
</style></head><body><div class="sheet">
  <div class="eyebrow">Hire3x · Marketing</div>
  <h1>Expense report — <mark>${m.full}</mark></h1>
  <div class="period">Generated ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · ${count} expense${count === 1 ? "" : "s"} · avg ${inr(avg)} per expense</div>

  <div class="stats">
    <div class="stat"><span class="label">Total spent</span><span class="val">${inr(monthTotal)}</span></div>
    <div class="stat"><span class="label">Budget allocated</span><span class="val">${monthBudget ? inr(monthBudget) : "—"}</span></div>
    <div class="stat"><span class="label">${isOver ? "Exceeded by" : "Remaining"}</span><span class="val ${isOver ? "over" : "ok"}">${monthBudget ? inr(Math.abs(remaining)) : "—"}</span></div>
    <div class="stat"><span class="label">Utilisation</span><span class="val ${isOver ? "over" : ""}">${utilization !== null ? utilization + "%" : "—"}</span></div>
  </div>
  ${budgetBar}
  ${isOver ? `<div class="alert">⚠ Budget exceeded — spend is ${inr(monthTotal - monthBudget)} over the ${inr(monthBudget)} allocation for ${m.full}.</div>` : ""}

  <h2>Executive summary</h2>
  <div class="summary">${sentences.join(" ")}</div>

  <h2>Spend by category</h2>
  <table><thead><tr><th>Category</th><th class="num">Amount</th><th class="num">Share</th><th class="num">vs ${prevM ? prevM.label : "prev"}</th><th></th></tr></thead>
  <tbody>${catRows || '<tr><td colspan="5">No expenses recorded.</td></tr>'}</tbody></table>

  <h2>Top expenses this month</h2>
  <table><thead><tr><th class="num">#</th><th>Description</th><th>Category</th><th>Date</th><th class="num">Amount</th><th class="num">Share</th></tr></thead>
  <tbody>${topRows || '<tr><td colspan="6">No expenses recorded.</td></tr>'}</tbody></table>

  <h2>Six-month overview · Aug 2026 – Jan 2027</h2>
  <table><thead><tr><th>Month</th><th class="num">Budget</th><th class="num">Spent</th><th class="num">Variance</th><th>Status</th></tr></thead>
  <tbody>${overviewRows}</tbody>
  <tfoot><tr style="font-weight:700"><td>Total</td><td class="num">${grandBudget ? inr(grandBudget) : "—"}</td><td class="num">${inr(grandTotal)}</td><td class="num" style="color:${grandBudget > 0 && grandBudget - grandTotal < 0 ? PALETTE.red : PALETTE.ink}">${grandBudget ? inr(grandBudget - grandTotal) : "—"}</td><td></td></tr></tfoot></table>

  <h2>Full expense ledger — ${m.full}</h2>
  <table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Invoice</th><th class="num">Amount</th><th>Notes</th></tr></thead>
  <tbody>${expRows || '<tr><td colspan="6">No expenses recorded.</td></tr>'}</tbody></table>

  <div class="foot">Marketing budget tracker · Aug 2026 – Jan 2027. Open in a browser and print to PDF for sharing.</div>
</div></body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expense-report-${activeMonth}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // ---------- render ----------
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: PALETTE.paper, color: PALETTE.grey }}
      >
        Loading your expenses…
      </div>
    );
  }

  const maxMonthTotal = Math.max(...Object.values(totalsByMonth), 1);

  return (
    <div
      className="min-h-screen"
      style={{
        background: PALETTE.paper,
        color: PALETTE.ink,
        fontFamily:
          "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* header */}
        <div
          className="text-xs uppercase mb-2"
          style={{ letterSpacing: "0.18em", color: PALETTE.grey }}
        >
          Hire3x · Marketing
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold leading-tight mb-1">
          Budget{" "}
          <span style={{ background: PALETTE.yellow, padding: "0 8px" }}>
            tracker
          </span>
        </h1>
        <p className="mb-8" style={{ color: PALETTE.grey }}>
          August 2026 → January 2027
          {saveState === "saving" && " · saving…"}
          {saveState === "error" &&
            " · couldn't save — your last change may not be stored"}
        </p>

        {/* six-month strip */}
        <div
          className="flex gap-1 mb-10 border-t-2 pt-4 overflow-x-auto"
          style={{ borderColor: PALETTE.ink }}
        >
          {MONTHS.map((m) => {
            const active = m.key === activeMonth;
            const t = totalsByMonth[m.key];
            const b = Number(budgets[m.key] || 0);
            const over = b > 0 && t > b;
            return (
              <button
                key={m.key}
                onClick={() => setActiveMonth(m.key)}
                className="flex-1 min-w-16 text-left px-3 py-2 transition-colors"
                style={{
                  background: active ? PALETTE.ink : "transparent",
                  color: active ? "#fff" : PALETTE.ink,
                }}
              >
                <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                  {m.label}
                  {over && (
                    <span
                      title="Over budget"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: PALETTE.red,
                        display: "inline-block",
                      }}
                    />
                  )}
                </div>
                <div
                  className="text-xs mt-1"
                  style={{
                    color: over
                      ? active
                        ? "#FF8A7E"
                        : PALETTE.red
                      : active
                      ? PALETTE.yellow
                      : PALETTE.grey,
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: over ? 700 : 400,
                  }}
                >
                  {t ? inr(t) : "·"}
                </div>
                <div
                  className="mt-2 h-1"
                  style={{
                    background: over
                      ? PALETTE.red
                      : active
                      ? PALETTE.yellow
                      : PALETTE.line,
                    width: `${Math.max((t / maxMonthTotal) * 100, 4)}%`,
                  }}
                />
              </button>
            );
          })}
        </div>

        <div className="grid md:grid-cols-5 gap-8">
          {/* left column */}
          <div className="md:col-span-2">
            <h2
              className="text-xs font-bold uppercase mb-4"
              style={{ letterSpacing: "0.14em" }}
            >
              {form.id ? "Edit expense" : "Add an expense"}
            </h2>
            <div
              className="p-5 space-y-4"
              style={{
                background: PALETTE.card,
                border: `1px solid ${PALETTE.line}`,
              }}
            >
              <Field label="What was it for?">
                <input
                  className="w-full px-3 py-2 outline-none"
                  style={inputStyle}
                  placeholder="e.g. Meta ads — anti-ghosting campaign"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount (₹)">
                  <input
                    type="number"
                    min="0"
                    className="w-full px-3 py-2 outline-none"
                    style={inputStyle}
                    placeholder="25000"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                  />
                </Field>
                <Field label="Date">
                  <input
                    type="date"
                    min="2026-08-01"
                    max="2027-01-31"
                    className="w-full px-3 py-2 outline-none"
                    style={inputStyle}
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Category">
                <select
                  className="w-full px-3 py-2 outline-none"
                  style={inputStyle}
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>

              <Field label="Invoice no. (optional)">
                <input
                  className="w-full px-3 py-2 outline-none"
                  style={inputStyle}
                  placeholder="INV-2026-041"
                  value={form.invoice}
                  onChange={(e) =>
                    setForm({ ...form, invoice: e.target.value })
                  }
                />
              </Field>

              <Field label="Notes (optional)">
                <textarea
                  rows={2}
                  className="w-full px-3 py-2 outline-none resize-none"
                  style={inputStyle}
                  placeholder="Context, vendor, what it covered…"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>

              {formError && (
                <div className="text-sm" style={{ color: PALETTE.red }}>
                  {formError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={submitExpense}
                  className="flex-1 py-3 font-bold text-sm uppercase tracking-wider"
                  style={{ background: PALETTE.ink, color: PALETTE.yellow }}
                >
                  {form.id ? "Save changes" : "Add expense"}
                </button>
                {form.id && (
                  <button
                    onClick={() => setForm(emptyForm())}
                    className="px-4 py-3 text-sm"
                    style={{ border: `1px solid ${PALETTE.line}` }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* budget box */}
            <div
              className="mt-6 p-5"
              style={{
                background: isOver ? PALETTE.redSoft : PALETTE.yellowSoft,
                borderLeft: `4px solid ${isOver ? PALETTE.red : PALETTE.yellow}`,
              }}
            >
              <div
                className="text-xs font-bold uppercase mb-2"
                style={{
                  letterSpacing: "0.14em",
                  color: isOver ? PALETTE.red : PALETTE.ink,
                }}
              >
                Budget · {MONTHS.find((m) => m.key === activeMonth).full}
              </div>
              {editingBudget ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    autoFocus
                    className="flex-1 px-3 py-2 outline-none"
                    style={inputStyle}
                    placeholder="e.g. 500000"
                    value={budgetDraft}
                    onChange={(e) => setBudgetDraft(e.target.value)}
                  />
                  <button
                    onClick={saveBudget}
                    className="px-4 font-bold text-sm"
                    style={{ background: PALETTE.ink, color: "#fff" }}
                  >
                    Set
                  </button>
                </div>
              ) : (
                <div className="flex items-baseline justify-between">
                  <div
                    className="text-2xl font-extrabold"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {monthBudget ? inr(monthBudget) : "Not set"}
                  </div>
                  <button
                    onClick={() => {
                      setBudgetDraft(monthBudget ? String(monthBudget) : "");
                      setEditingBudget(true);
                    }}
                    className="text-sm underline"
                  >
                    {monthBudget ? "Change" : "Set budget"}
                  </button>
                </div>
              )}
              {monthBudget > 0 && !editingBudget && (
                <div
                  className="mt-2 text-sm font-semibold"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {isOver ? (
                    <span style={{ color: PALETTE.red }}>
                      ⚠ Exceeded by {inr(Math.abs(remaining))} ({utilization}%
                      used)
                    </span>
                  ) : (
                    <span style={{ color: PALETTE.green }}>
                      {inr(remaining)} remaining · {utilization}% used
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* right column */}
          <div className="md:col-span-3">
            <div className="flex items-end justify-between mb-3 flex-wrap gap-3">
              <div>
                <h2
                  className="text-xs font-bold uppercase"
                  style={{ letterSpacing: "0.14em" }}
                >
                  {MONTHS.find((m) => m.key === activeMonth).full}
                </h2>
                <div
                  className="text-3xl font-extrabold mt-1"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  <span
                    style={{
                      background: monthTotal
                        ? isOver
                          ? PALETTE.red
                          : PALETTE.yellow
                        : "transparent",
                      color: isOver ? "#fff" : PALETTE.ink,
                      padding: monthTotal ? "0 8px" : 0,
                    }}
                  >
                    {inr(monthTotal)}
                  </span>
                  {monthBudget > 0 && (
                    <span
                      className="text-base font-semibold ml-2"
                      style={{ color: PALETTE.grey }}
                    >
                      of {inr(monthBudget)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={generateReport}
                disabled={monthExpenses.length === 0}
                className="py-3 px-5 font-bold text-sm uppercase tracking-wider"
                style={{
                  background:
                    monthExpenses.length === 0 ? PALETTE.line : PALETTE.blue,
                  color: monthExpenses.length === 0 ? PALETTE.grey : "#fff",
                  cursor:
                    monthExpenses.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                Generate monthly report
              </button>
            </div>

            {/* budget utilisation bar */}
            {monthBudget > 0 && (
              <div className="mb-6">
                <div
                  className="flex h-3 overflow-hidden"
                  style={{ background: "#F1EBDD" }}
                >
                  <div
                    className="h-3 transition-all"
                    style={{
                      width: `${Math.min(utilization, 100)}%`,
                      background: PALETTE.yellow,
                    }}
                  />
                  {isOver && (
                    <div
                      className="h-3 transition-all"
                      style={{
                        width: `${Math.min(utilization - 100, 100)}%`,
                        background: PALETTE.red,
                      }}
                    />
                  )}
                </div>
                <div
                  className="flex justify-between text-xs mt-1"
                  style={{ color: PALETTE.grey }}
                >
                  <span>{utilization}% of budget used</span>
                  {isOver ? (
                    <span className="font-bold" style={{ color: PALETTE.red }}>
                      {inr(monthTotal - monthBudget)} over budget
                    </span>
                  ) : (
                    <span>{inr(remaining)} left</span>
                  )}
                </div>
              </div>
            )}

            {/* category bars */}
            {byCategory.length > 0 && (
              <div
                className="p-5 mb-6"
                style={{
                  background: PALETTE.card,
                  border: `1px solid ${PALETTE.line}`,
                }}
              >
                <div
                  className="text-xs font-bold uppercase mb-3"
                  style={{ letterSpacing: "0.14em", color: PALETTE.grey }}
                >
                  Where it went
                </div>
                {byCategory.map(([cat, amt], i) => {
                  const pct = monthTotal
                    ? Math.round((amt / monthTotal) * 100)
                    : 0;
                  return (
                    <div key={cat} className="mb-3 last:mb-0">
                      <div className="flex justify-between text-sm mb-1">
                        <span className={i === 0 ? "font-bold" : ""}>
                          {cat}
                          {i === 0 && (
                            <span
                              className="ml-2 text-xs px-2 py-0.5"
                              style={{
                                background: PALETTE.ink,
                                color: PALETTE.yellow,
                              }}
                            >
                              biggest spend
                            </span>
                          )}
                        </span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {inr(amt)} · {pct}%
                        </span>
                      </div>
                      <div className="h-2" style={{ background: "#F1EBDD" }}>
                        <div
                          className="h-2 transition-all"
                          style={{
                            width: `${pct}%`,
                            background: i === 0 ? PALETTE.yellow : PALETTE.ink,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* expense list */}
            {monthExpenses.length === 0 ? (
              <div
                className="p-10 text-center"
                style={{
                  border: `1px dashed ${PALETTE.line}`,
                  color: PALETTE.grey,
                }}
              >
                No expenses in {MONTHS.find((m) => m.key === activeMonth).full}{" "}
                yet. Add the first one on the left.
              </div>
            ) : (
              <div
                style={{
                  background: PALETTE.card,
                  border: `1px solid ${PALETTE.line}`,
                }}
              >
                {monthExpenses.map((e) => (
                  <div
                    key={e.id}
                    className="px-5 py-4 flex gap-4 items-start"
                    style={{ borderBottom: `1px solid #EFE9DA` }}
                  >
                    <div
                      className="text-xs pt-1 w-12 shrink-0"
                      style={{ color: PALETTE.grey }}
                    >
                      {fmtDate(e.date)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">
                        {e.description}
                      </div>
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: PALETTE.grey }}
                      >
                        {e.category}
                        {e.invoice ? ` · ${e.invoice}` : ""}
                        {e.notes ? ` · ${e.notes}` : ""}
                      </div>
                    </div>
                    <div
                      className="font-bold text-sm shrink-0"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {inr(e.amount)}
                    </div>
                    <div className="flex gap-2 shrink-0 pt-0.5">
                      <button
                        onClick={() => editExpense(e)}
                        className="text-xs underline"
                        style={{ color: PALETTE.blue }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteExpense(e.id)}
                        className="text-xs underline"
                        style={{ color: PALETTE.red }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                <div
                  className="px-5 py-3 flex justify-between text-sm font-bold"
                  style={{ background: PALETTE.paper }}
                >
                  <span>
                    {monthExpenses.length} expense
                    {monthExpenses.length === 1 ? "" : "s"}
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {inr(monthTotal)}
                  </span>
                </div>
              </div>
            )}

            {/* running totals */}
            <div
              className="mt-6 text-sm space-y-1"
              style={{ color: PALETTE.grey }}
            >
              <div className="flex justify-between">
                <span>Total budget allocated, Aug 2026 – Jan 2027</span>
                <span
                  className="font-bold"
                  style={{
                    color: PALETTE.ink,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {grandBudget ? inr(grandBudget) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total spent so far</span>
                <span
                  className="font-bold"
                  style={{
                    color:
                      grandBudget > 0 && grandTotal > grandBudget
                        ? PALETTE.red
                        : PALETTE.ink,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {inr(grandTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- small helpers ----------
const inputStyle = {
  background: "#FDFBF6",
  border: "1px solid #E4DCC9",
  color: "#141311",
  fontSize: "14px",
};

function Field({ label, children }) {
  return (
    <div>
      <label
        className="block text-xs font-bold uppercase mb-1"
        style={{ letterSpacing: "0.1em", color: "#8A8577" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
