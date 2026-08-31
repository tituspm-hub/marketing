import { inr } from "../../lib/format.js";

const ACCENTS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function CategoryBreakdown({ byCategory, total, label }) {
  if (byCategory.length === 0) {
    return (
      <div className="text-center py-14 px-6">
        <p className="font-extrabold">Nothing logged for {label}</p>
        <p className="text-muted-foreground text-sm mt-1">
          Categories appear here as soon as the first expense lands.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {byCategory.map(([category, amount], i) => {
        const share = total ? Math.round((amount / total) * 100) : 0;
        const accent = `var(--color-cat-${ACCENTS[i % ACCENTS.length]})`;
        return (
          <li key={category}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="font-semibold flex items-center gap-2 min-w-0">
                <span className="size-2.5 rounded-full shrink-0" style={{ background: accent }} />
                <span className="truncate">{category}</span>
              </span>
              <span className="text-sm shrink-0">
                <span className="tabular font-extrabold">{inr(amount)}</span>
                <span className="text-muted-foreground ml-2 tabular">{share}%</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-[width] duration-700"
                   style={{ width: `${share}%`, background: accent }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
