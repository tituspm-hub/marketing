import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../lib/firebase.js";

// One document per expense, streamed live: five people edit at once and a whole-state
// blob would have them overwriting each other.
export function useExpenses() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() =>
    onSnapshot(
      query(collection(db, "expenses"), orderBy("date", "desc")),
      (snap) => {
        setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); }
    ), []);

  return { expenses, loading, error };
}
