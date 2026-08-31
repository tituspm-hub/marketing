import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase.js";

export function useBudgets() {
  const [budgets, setBudgets] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() =>
    onSnapshot(
      collection(db, "budgets"),
      (snap) => {
        const next = {};
        for (const d of snap.docs) next[d.id] = Number(d.data().amount ?? 0);
        setBudgets(next);
        setLoading(false);
      },
      () => setLoading(false)
    ), []);

  return { budgets, loading };
}
