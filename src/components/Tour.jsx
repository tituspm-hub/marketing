import { useEffect, useState } from "react";
import { X, ArrowRight } from "lucide-react";

const KEY = "hire3x-budget-tour-v1";

const STEPS = [
  { target: "months", title: "Pick a month",
    body: "Each tab shows what that month has spent and how much of its budget is gone. The whole period reads at a glance." },
  { target: "stats", title: "Budget, spend, what is left",
    body: "The bar fills as the month is spent. It turns red the moment spending passes the budget." },
  { target: "form", title: "Log an expense",
    body: "Fill this in and it appears for the whole team straight away. Press n from anywhere to jump here." },
  { target: "actions", title: "Take it with you",
    body: "Export the month as a spreadsheet, print a report to PDF, or import expenses from a file." },
];

// Shown once per browser, dismissable at any point. A person who skips it is never
// asked again; the interface has to stand on its own regardless.
export default function Tour() {
  const [step, setStep] = useState(null);

  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setStep(0); } catch { /* storage blocked */ }
  }, []);

  function close() {
    setStep(null);
    try { localStorage.setItem(KEY, "seen"); } catch { /* storage blocked */ }
  }

  useEffect(() => {
    if (step === null) return undefined;
    const node = document.querySelector(`[data-tour="${STEPS[step].target}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    node?.classList.add("ring-2", "ring-primary", "ring-offset-4", "rounded-card");
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      node?.classList.remove("ring-2", "ring-primary", "ring-offset-4", "rounded-card");
      window.removeEventListener("keydown", onKey);
    };
  }, [step]);

  if (step === null) return null;
  const { title, body } = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-x-4 bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[340px] z-50">
      <div className="bg-white rounded-card shadow-lift p-5 border border-line">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-bold tracking-[0.12em] text-primary">
            STEP {step + 1} OF {STEPS.length}
          </p>
          <button onClick={close} aria-label="Skip the tour" data-compact
                  className="text-muted-foreground hover:text-ink -mt-1 -mr-1 p-1">
            <X className="size-4" />
          </button>
        </div>
        <h3 className="font-extrabold mt-1.5">{title}</h3>
        <p className="text-muted-foreground text-sm mt-1">{body}</p>
        <div className="flex items-center gap-2 mt-4">
          <button onClick={() => (last ? close() : setStep(step + 1))}
                  className="inline-flex items-center gap-2 rounded-full bg-primary text-white text-sm font-semibold px-4">
            {last ? "Got it" : "Next"}
            {!last && <ArrowRight className="size-4" />}
          </button>
          {!last && (
            <button onClick={close} className="text-sm font-semibold text-muted-foreground px-3">
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
