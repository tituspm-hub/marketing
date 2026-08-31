// Direct end-to-end check against the running emulators, through the same client SDK
// the browser uses. Exercises the username -> synthetic-email login the unit and rules
// suites both stub out.
import { initializeApp } from "firebase/app";
import {
  getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut,
} from "firebase/auth";
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, collection,
  addDoc, getDocs, serverTimestamp,
} from "firebase/firestore";
import { toAuthEmail } from "../src/lib/username.js";

const [username, password] = process.argv.slice(2);

const app = initializeApp({
  apiKey: "demo-api-key",
  authDomain: "demo-hire3x.firebaseapp.com",
  projectId: "demo-hire3x",
  storageBucket: "demo-hire3x.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:demo",
});
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (err) { console.log(`  FAIL  ${name}\n          ${err.message}`); fail++; }
}
async function mustDeny(name, fn) {
  await check(name, async () => {
    let denied = false;
    try { await fn(); } catch (err) {
      denied = String(err.code ?? err.message).includes("permission-denied");
      if (!denied) throw err;
    }
    if (!denied) throw new Error("the write was ALLOWED but rules should deny it");
  });
}
function eq(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
}

console.log(`\nSigning in as @${username} (no '@' is ever typed by the user)\n`);

await check("username maps to a synthetic address and signs in", async () => {
  const cred = await signInWithEmailAndPassword(auth, toAuthEmail(username), password);
  eq(cred.user.uid, "sa_gebin", "uid");
});

await check("the ID token carries the superadmin claim", async () => {
  const res = await auth.currentUser.getIdTokenResult(true);
  eq(res.claims.role, "superadmin", "role claim");
});

await check("own profile is readable and holds no email", async () => {
  const snap = await getDoc(doc(db, "users", "sa_gebin"));
  if (!snap.exists()) throw new Error("no /users doc");
  eq(snap.data().username, "gebin", "username");
  eq(snap.data().role, "superadmin", "role");
  if (JSON.stringify(snap.data()).includes("@")) throw new Error("profile leaks an address");
});

await mustDeny("a super-admin still cannot write /users from the client", () =>
  setDoc(doc(db, "users", "sa_gebin"), { role: "superadmin", username: "gebin" }, { merge: true })
);

await check("settings/app is readable and defines the period", async () => {
  const snap = await getDoc(doc(db, "settings", "app"));
  eq(snap.data().periodStart, "2026-08", "periodStart");
  eq(snap.data().periodEnd, "2027-01", "periodEnd");
});

const validExpense = {
  description: "Meta Ads — September burst",
  amount: 45000,
  date: "2026-09-14",
  month: "2026-09",
  category: "Meta Ads",
  createdBy: "sa_gebin",
  updatedBy: "sa_gebin",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
};

let expenseId;
await check("an in-period expense is accepted", async () => {
  const ref = await addDoc(collection(db, "expenses"), validExpense);
  expenseId = ref.id;
});

await check("the expense reads back as its own document", async () => {
  const snap = await getDoc(doc(db, "expenses", expenseId));
  eq(snap.data().amount, 45000, "amount");
});

await mustDeny("an expense outside the tracking period is refused", () =>
  addDoc(collection(db, "expenses"), { ...validExpense, month: "2027-05", date: "2027-05-02" })
);
await mustDeny("a negative amount is refused", () =>
  addDoc(collection(db, "expenses"), { ...validExpense, amount: -1 })
);
await mustDeny("a date that disagrees with its month is refused", () =>
  addDoc(collection(db, "expenses"), { ...validExpense, date: "2026-11-03" })
);
await mustDeny("an expense attributed to someone else is refused", () =>
  addDoc(collection(db, "expenses"), { ...validExpense, createdBy: "sa_yash" })
);
await mustDeny("an unknown field is refused", () =>
  addDoc(collection(db, "expenses"), { ...validExpense, secret: "x" })
);

await check("expenses are listable", async () => {
  const snap = await getDocs(collection(db, "expenses"));
  if (snap.empty) throw new Error("no expenses returned");
});

await signOut(auth);

await check("a signed-out client can read nothing", async () => {
  let denied = false;
  try { await getDoc(doc(db, "settings", "app")); }
  catch (err) { denied = String(err.code).includes("permission-denied"); }
  if (!denied) throw new Error("settings were readable while signed out");
});

await check("a wrong password is rejected", async () => {
  try { await signInWithEmailAndPassword(auth, toAuthEmail(username), "Wrong-password-1"); }
  catch { return; }
  throw new Error("signed in with the wrong password");
});

await check("an unknown username is rejected", async () => {
  try { await signInWithEmailAndPassword(auth, toAuthEmail("nobodyhere"), password); }
  catch { return; }
  throw new Error("signed in as a user that does not exist");
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
