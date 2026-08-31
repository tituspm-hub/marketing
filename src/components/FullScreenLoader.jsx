import { useEffect, useState } from "react";

// The branded loader is a 3.5MB animation, so it is not part of the first paint: a
// session check that resolves in 200ms should never pull it down. The ring shows
// immediately, the mascot only if the wait is long enough for anyone to notice.
export default function FullScreenLoader({ label = "Loading…" }) {
  const [showBrand, setShowBrand] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowBrand(true), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="min-h-screen grid place-items-center bg-surface px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-5">
        {showBrand ? (
          <img src="/loader.gif" alt="" width="160" className="h-auto" />
        ) : (
          <span
            aria-hidden="true"
            className="block size-8 rounded-full border-2 border-line border-t-primary animate-spin"
          />
        )}
        <p className="text-muted-foreground text-sm">{label}</p>
      </div>
    </div>
  );
}
