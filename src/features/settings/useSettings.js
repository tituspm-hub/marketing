import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase.js";

const FALLBACK = { periodStart: "2026-08", periodEnd: "2027-01", currency: "INR", categories: [] };

// The tracking period and category list are data, not constants: the old build had
// both hardcoded, so the app silently stopped working outside a fixed six months.
export function useSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() =>
    onSnapshot(
      doc(db, "settings", "app"),
      (snap) => { setSettings(snap.exists() ? { ...FALLBACK, ...snap.data() } : FALLBACK); setLoading(false); },
      () => { setSettings(FALLBACK); setLoading(false); }
    ), []);

  return { settings: settings ?? FALLBACK, loading };
}
