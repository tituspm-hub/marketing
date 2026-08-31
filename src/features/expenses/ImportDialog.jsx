import { useState } from "react";
import { collection, writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { X, Upload, FileSpreadsheet } from "lucide-react";
import { db } from "../../lib/firebase.js";
import { parseCsv, toCsv, download } from "../reports/exportData.js";
import { parseAmount, MAX_AMOUNT, inr } from "../../lib/format.js";
import { monthKey, isWithinPeriod } from "../../lib/period.js";

export default function ImportDialog({ open, onClose, settings, uid }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const known = new Set(settings.categories.map((c) => c.label ?? c));

  function reset() { setPreview(null); setError(""); onClose(); }

  async function pick(event) {
    setError("");
    setPreview(null);
    const file = event.target.files?.[0];
    if (!file) return;

    const parsed = parseCsv(await file.text());
    if (!parsed.ok) return setError(parsed.reason);

    // Every row is checked here so the person sees the problems before anything is
    // written, rather than a partial import they have to unpick.
    const rows = [];
    const problems = [];
    parsed.rows.forEach((row, i) => {
      const amount = parseAmount(row.amount);
      const line = i + 2;
      if (amount === null) problems.push(`Row ${line}: amount is not a number above zero.`);
      else if (amount > MAX_AMOUNT) problems.push(`Row ${line}: amount looks wrong.`);
      else if (!isWithinPeriod(row.date, settings.periodStart, settings.periodEnd)) {
        problems.push(`Row ${line}: ${row.date} is outside ${settings.periodStart}–${settings.periodEnd}.`);
      } else if (!known.has(row.category)) {
        problems.push(`Row ${line}: "${row.category}" is not one of the categories.`);
      } else {
        rows.push({ ...row, amount });
      }
    });

    setPreview({ rows, problems, total: rows.reduce((s, r) => s + r.amount, 0) });
  }

  async function commit() {
    setBusy(true);
    try {
      // One batch, so a mid-import failure leaves nothing half-written.
      const batch = writeBatch(db);
      for (const row of preview.rows) {
        const ref = doc(collection(db, "expenses"));
        const payload = {
          description: row.description.slice(0, 200),
          amount: row.amount,
          date: row.date,
          month: monthKey(row.date),
          category: row.category,
          createdBy: uid, updatedBy: uid,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        };
        if (row.invoice) payload.invoice = row.invoice.slice(0, 80);
        if (row.notes) payload.notes = row.notes.slice(0, 1000);
        batch.set(ref, payload);
      }
      await batch.commit();
      toast.success(`Imported ${preview.rows.length} expenses`);
      reset();
    } catch {
      setError("The import was refused. Check the dates fall inside the tracking period.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm grid place-items-center p-4 z-50"
         role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="bg-white rounded-card shadow-lift p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-1">
          <h2 id="import-title" className="text-lg font-extrabold">Import expenses</h2>
          <button onClick={reset} aria-label="Close" data-compact className="text-muted-foreground p-1">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-muted-foreground text-sm mb-5">
          A spreadsheet saved as CSV, with columns for date, category, description and amount.
        </p>

        <button onClick={() => download("expense-template.csv",
                  toCsv([{ date: `${settings.periodStart}-01`, month: settings.periodStart,
                           category: settings.categories[0]?.label ?? "Other",
                           description: "Example line — replace this", amount: 25000,
                           invoice: "", notes: "" }]))}
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary mb-4">
          <FileSpreadsheet className="size-4" />
          Download a template
        </button>

        <label className="block border-2 border-dashed border-line rounded-card p-8 text-center cursor-pointer hover:border-primary transition-colors">
          <Upload className="size-6 mx-auto text-muted-foreground mb-2" />
          <span className="font-semibold text-sm">Choose a CSV file</span>
          <input type="file" accept=".csv,text/csv" onChange={pick} className="sr-only" />
        </label>

        {error && (
          <p role="alert" className="text-danger text-sm mt-4 flex gap-2">
            <span aria-hidden="true">⚠</span><span>{error}</span>
          </p>
        )}

        {preview && (
          <div className="mt-5">
            <p className="font-semibold text-sm">
              {preview.rows.length} ready to import
              {preview.rows.length > 0 && <> · <span className="tabular">{inr(preview.total)}</span></>}
            </p>
            {preview.problems.length > 0 && (
              <div className="mt-3 rounded-xl bg-danger/5 border border-danger/20 p-3">
                <p className="text-danger text-sm font-semibold mb-1">
                  {preview.problems.length} skipped
                </p>
                <ul className="text-danger text-xs space-y-0.5 max-h-32 overflow-y-auto">
                  {preview.problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={commit} disabled={busy || preview.rows.length === 0}
                      className="rounded-full bg-primary text-white font-semibold px-6 disabled:opacity-50">
                {busy ? "Importing…" : `Import ${preview.rows.length}`}
              </button>
              <button onClick={reset} className="rounded-full border border-line font-semibold px-6">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
