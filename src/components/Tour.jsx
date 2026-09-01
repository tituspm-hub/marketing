import { useEffect, useState } from "react";
import { X, ArrowRight } from "lucide-react";

const KEY = "hire3x-budget-tour-v2";
const PAD = 8;

const STEPS = [
  { target: "months", title: "Pick a month",
    body: "Each segment shows what that month has spent and how much of its budget is gone. The whole period reads at a glance." },
  { target: "stats", title: "Budget, spend, what is left",
    body: "The bar fills as the month is spent, and turns red the moment spending passes the budget. Owners set the budget from the pencil." },
  { target: "form", title: "Log an expense",
    body: "Four fields and it is filed for the whole team. Missing a category? Choose Other and name your own — everyone gets it." },
  { target: "actions", title: "Print the month",
    body: "Report opens your browser's print dialog, so you can save the month as a PDF or put it on paper." },
  { target: "nav", title: "The ledger is next door",
    body: "Every expense, with search, category filters and sorting, lives on its own page. The month you picked follows you there." },
];

// Shown once per browser, dismissable at any point. A person who skips it is never
// asked again; the interface has to stand on its own regardless.
export default function Tour() {
  const [step, setStep] = useState(null);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setStep(0); } catch { /* storage blocked */ }
  }, []);

  function close() {
    setStep(null);
    setRect(null);
    try { localStorage.setItem(KEY, "seen"); } catch { /* storage blocked */ }
  }

  useEffect(() => {
    if (step === null) return undefined;
    const node = document.querySelector(`[data-tour="${STEPS[step].target}"]`);
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    if (!node) {
      setRect(null);
      return () => window.removeEventListener("keydown", onKey);
    }

    node.scrollIntoView?.({ behavior: "smooth", block: "center" });
    const measure = () => setRect(node.getBoundingClientRect());
    measure();
    // The cut-out has to follow the smooth scroll to its destination. Bounded: the
    // poll stops once the scroll can no longer be in flight.
    const follow = window.setInterval(measure, 80);
    const stop = window.setTimeout(() => window.clearInterval(follow), 1000);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      window.clearInterval(follow);
      window.clearTimeout(stop);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  if (step === null) return null;
  const { title, body } = STEPS[step];
  const last = step === STEPS.length - 1;
  // Keep the card away from whatever is currently lit up.
  const cardAtTop = rect ? rect.top + rect.height / 2 > window.innerHeight / 2 : false;

  return (
    <>
      <Spotlight rect={rect} onDismiss={close} />

      <div className={`fixed inset-x-4 sm:inset-x-auto sm:right-6 sm:w-[340px] z-[60] ${
        cardAtTop ? "top-4 sm:top-6" : "bottom-4 sm:bottom-6"
      }`}>
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

          <div className="flex items-center gap-1.5 mt-4" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.target} className={`h-1 rounded-full transition-all ${
                i === step ? "w-5 bg-primary" : "w-1.5 bg-line"
              }`} />
            ))}
          </div>

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
    </>
  );
}

// Four bands rather than one dimmed sheet with a raised target: a raised element is
// trapped in whatever stacking context its parent makes, and the sidebar makes one.
// Cutting the hole out of the overlay works wherever the target happens to live.
function Spotlight({ rect, onDismiss }) {
  const band = "fixed bg-ink/50 backdrop-blur-[3px] z-50";
  if (!rect) {
    return <div className={`${band} inset-0`} onClick={onDismiss} />;
  }

  const top = Math.max(rect.top - PAD, 0);
  const left = Math.max(rect.left - PAD, 0);
  const right = rect.right + PAD;
  const bottom = rect.bottom + PAD;

  return (
    <>
      <div className={band} onClick={onDismiss}
           style={{ top: 0, left: 0, right: 0, height: top }} />
      <div className={band} onClick={onDismiss}
           style={{ top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div className={band} onClick={onDismiss}
           style={{ top, left: 0, width: left, height: bottom - top }} />
      <div className={band} onClick={onDismiss}
           style={{ top, left: right, right: 0, height: bottom - top }} />
      <div className="fixed z-50 rounded-2xl ring-2 ring-primary pointer-events-none"
           style={{ top, left, width: right - left, height: bottom - top }} />
    </>
  );
}
