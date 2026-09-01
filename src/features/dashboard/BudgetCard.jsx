import { useEffect, useRef, useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Wallet, Pencil, Check, X } from "lucide-react";
import { db } from "../../lib/firebase.js";
import { inr, parseAmount } from "../../lib/format.js";

// The budget used to be a stray button sitting under the stats. It belongs on the card
// that shows the number: an owner edits the figure where they read it.
export default function BudgetCard({ monthKey: key, label, amount, previous, canEdit, uid }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const field = useRef(null);

  useEffect(() => { if (editing) field.current?.select(); }, [editing]);

  function open() {
    setDraft(amount ? String(amount) : "");
    setEditing(true);
  }

  async function save() {
    const next = draft.trim() === "" ? 0 : parseAmount(draft);
    if (next === null) return toast.error("Budget needs to be a number.");
    setBusy(true);
    try {
      await setDoc(doc(db, "budgets", key), { amount: next, updatedBy: uid, updatedAt: serverTimestamp() });
      toast.success(next ? `Budget for ${label} set to ${inr(next)}` : `Budget cleared for ${label}`);
      setEditing(false);
    } catch {
      toast.error("Could not save the budget.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="bg-white rounded-card shadow-lift p-5 ring-1 ring-primary/30">
        <label htmlFor="budget" className="text-[10px] font-bold tracking-[0.12em] text-primary">
          BUDGET FOR {label.toUpperCase()}
        </label>
        <div className="relative mt-2">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
          <input id="budget" inputMode="decimal" value={draft} autoFocus ref={field}
                 onChange={(e) => setDraft(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === "Enter") { e.preventDefault(); save(); }
                   if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
                 }}
                 placeholder="5,00,000"
                 className="w-full rounded-xl border border-line pl-8 pr-3 text-lg font-extrabold tabular outline-none focus:border-primary" />
        </div>

        {previous > 0 && previous !== amount && (
          <button type="button" data-compact onClick={() => setDraft(String(previous))}
                  className="mt-2 text-xs font-semibold text-primary hover:underline">
            Use last month’s {inr(previous)}
          </button>
        )}

        <div className="flex gap-2 mt-3">
          <button type="button" onClick={save} disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white text-sm font-semibold px-4 disabled:opacity-60">
            <Check className="size-3.5" />
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" data-compact onClick={() => setEditing(false)} aria-label="Cancel"
                  className="grid place-items-center size-9 rounded-full border border-line text-muted-foreground hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2.5">Leave it empty to clear the budget.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-card shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground">
          BUDGET · {label.toUpperCase()}
        </p>
        {canEdit ? (
          <button type="button" data-compact onClick={open}
                  aria-label={amount ? `Change the ${label} budget` : `Set a budget for ${label}`}
                  title={amount ? "Change this budget" : "Set this budget"}
                  className="grid place-items-center size-8 rounded-lg bg-accent text-primary shrink-0 hover:bg-primary hover:text-white transition-colors">
            <Pencil className="size-4" />
          </button>
        ) : (
          <span className="grid place-items-center size-8 rounded-lg bg-accent text-primary shrink-0">
            <Wallet className="size-4" />
          </span>
        )}
      </div>
      <p className={`text-[28px] leading-tight font-extrabold tabular mt-2 ${
        amount ? "text-ink" : "text-muted-foreground"
      }`}>
        {amount ? inr(amount) : "Not set"}
      </p>
      {canEdit ? (
        <button type="button" data-compact onClick={open}
                className="text-xs font-semibold text-primary mt-2 hover:underline">
          {amount ? "Change it" : `Set a budget for ${label}`}
        </button>
      ) : (
        !amount && <p className="text-xs text-muted-foreground mt-2">An owner sets this.</p>
      )}
    </div>
  );
}
