import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

// The real super-admin UIDs. Because they are fixed literals rather than values
// Firebase generates, the rules can be tested against exactly the identities that
// production uses — no substitution, nothing to drift.
export const YASH = "sa_yash";
export const TITUS = "sa_titus";
export const GEBIN = "sa_gebin";
export const ADMIN = "uid_admin";
export const MEMBER = "uid_member";
export const DISABLED = "uid_disabled";

export async function makeEnv() {
  return initializeTestEnvironment({
    projectId: "demo-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
}

export async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "settings/app"), {
      periodStart: "2026-08",
      periodEnd: "2027-01",
      categories: [{ id: "meta", label: "Meta Ads", color: "sky", recurring: false }],
      currency: "INR",
    });
    const people = [
      [YASH, "yash", "superadmin", false],
      [TITUS, "titus", "superadmin", false],
      [GEBIN, "gebin", "superadmin", false],
      [ADMIN, "adminuser", "admin", false],
      [MEMBER, "member", "member", false],
      [DISABLED, "gone", "member", true],
    ];
    for (const [uid, username, role, disabled] of people) {
      await setDoc(doc(db, `users/${uid}`), { username, role, disabled, mustChangePassword: false });
    }
  });
}

// Custom claims are the second argument; this is how rules see request.auth.token.role.
export const as = (env, uid, role) => env.authenticatedContext(uid, { role }).firestore();

export const validExpense = (uid, over = {}) => ({
  description: "Meta ads sprint",
  amount: 25000,
  date: "2026-09-12",
  month: "2026-09",
  category: "meta",
  createdBy: uid,
  createdAt: new Date("2026-09-12T00:00:00Z"),
  updatedBy: uid,
  updatedAt: new Date("2026-09-12T00:00:00Z"),
  ...over,
});
