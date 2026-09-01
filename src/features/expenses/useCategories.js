import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { mergeCategories, normaliseCategory } from "../../lib/category.js";

// The seeded list on /settings/app is admin-only, so a member who needs a bucket that
// is not there adds it to /categories instead. Both lists arrive at the picker merged.
export function useCategories(seeded) {
  const [added, setAdded] = useState([]);

  useEffect(() =>
    onSnapshot(
      collection(db, "categories"),
      (snap) => setAdded(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      // A read failure must not blank the picker: the seeded list still works.
      () => setAdded([])
    ), []);

  const categories = useMemo(() => mergeCategories(seeded, added), [seeded, added]);

  const addCategory = useCallback(async (input, uid) => {
    const check = normaliseCategory(input, categories);
    if (!check.ok) return check;

    const ref = doc(db, "categories", check.id);
    try {
      await setDoc(ref, { label: check.label, createdBy: uid, createdAt: serverTimestamp() });
    } catch (err) {
      // Two people can name the same category in the same minute. The id is derived
      // from the label, so the loser's write is refused as an update to a document
      // that already says what they wanted it to say — that is a success, not a fault.
      const existing = await getDoc(ref).catch(() => null);
      if (err?.code === "permission-denied" && existing?.exists()) {
        return { ok: true, label: existing.data().label ?? check.label, id: check.id };
      }
      return { ok: false, reason: "Could not save that category. Try again." };
    }
    return check;
  }, [categories]);

  return { categories, addCategory };
}
