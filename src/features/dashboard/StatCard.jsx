// One number per card, with the label above it and the interpretation below. The
// figure is the only thing set large, so the eye lands on it first.
export default function StatCard({ eyebrow, value, hint, tone = "ink", icon: Icon, meter }) {
  const tones = {
    ink: "text-ink",
    danger: "text-danger",
    success: "text-success",
    muted: "text-muted-foreground",
  };
  return (
    <div className="bg-white rounded-card shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground">
          {eyebrow.toUpperCase()}
        </p>
        {Icon && (
          <span className="grid place-items-center size-8 rounded-lg bg-accent text-primary shrink-0">
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className={`text-[28px] leading-tight font-extrabold tabular mt-2 ${tones[tone]}`}>
        {value}
      </p>
      {meter !== undefined && (
        <div className="h-1.5 rounded-full bg-muted mt-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${
              tone === "danger" ? "bg-danger" : "bg-primary"
            }`}
            style={{ width: `${Math.min(Math.max(meter, 0), 100)}%` }}
          />
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground mt-2">{hint}</p>}
    </div>
  );
}
