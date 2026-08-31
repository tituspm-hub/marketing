// tests/rules/privilege.rules.test.js
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { makeEnv, seed, as, YASH, TITUS, GEBIN, ADMIN, MEMBER, DISABLED } from "./helpers.js";

let env;
beforeAll(async () => { env = await makeEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(env); });

describe("/users is unwritable from every client", () => {
  it("blocks a member editing their own role", async () => {
    await assertFails(updateDoc(doc(as(env, MEMBER, "member"), `users/${MEMBER}`), { role: "admin" }));
  });
  it("blocks an admin promoting anyone", async () => {
    await assertFails(updateDoc(doc(as(env, ADMIN, "admin"), `users/${MEMBER}`), { role: "admin" }));
  });
  it("blocks a super-admin too, since all role changes go through the API", async () => {
    await assertFails(updateDoc(doc(as(env, YASH, "superadmin"), `users/${MEMBER}`), { role: "admin" }));
  });
  it("blocks anyone disabling any of the three super-admins", async () => {
    for (const target of [YASH, TITUS, GEBIN]) {
      await assertFails(updateDoc(doc(as(env, ADMIN, "admin"), `users/${target}`), { disabled: true }));
    }
  });
  it("blocks one super-admin disabling another", async () => {
    await assertFails(updateDoc(doc(as(env, GEBIN, "superadmin"), `users/${YASH}`), { disabled: true }));
  });
  it("still allows reading the roster, which the UI needs for attribution", async () => {
    await assertSucceeds(getDoc(doc(as(env, MEMBER, "member"), `users/${ADMIN}`)));
  });
});

describe("a forged role claim does not grant super-admin", () => {
  it("rejects a member who mints themselves a superadmin claim", async () => {
    // A real client cannot set this claim; the test proves the UID list is what counts.
    const forged = as(env, MEMBER, "superadmin");
    await assertFails(setDoc(doc(forged, "budgets/2026-09"),
      { amount: 500000, updatedBy: MEMBER, updatedAt: serverTimestamp() }));
  });
});

describe("budgets are admin-only", () => {
  const budget = (uid) => ({ amount: 500000, updatedBy: uid, updatedAt: serverTimestamp() });
  it("lets an admin set one", async () => {
    await assertSucceeds(setDoc(doc(as(env, ADMIN, "admin"), "budgets/2026-09"), budget(ADMIN)));
  });
  it("lets every super-admin set one even with no role claim present", async () => {
    for (const uid of [YASH, TITUS, GEBIN]) {
      await assertSucceeds(setDoc(doc(as(env, uid, undefined), "budgets/2026-09"), budget(uid)));
    }
  });
  it("blocks a member", async () => {
    await assertFails(setDoc(doc(as(env, MEMBER, "member"), "budgets/2026-09"), budget(MEMBER)));
  });
  it("blocks a month outside the configured period", async () => {
    await assertFails(setDoc(doc(as(env, ADMIN, "admin"), "budgets/2027-06"), budget(ADMIN)));
  });
  it("blocks a negative amount", async () => {
    await assertFails(setDoc(doc(as(env, ADMIN, "admin"), "budgets/2026-09"),
      { ...budget(ADMIN), amount: -1 }));
  });
  it("blocks attributing the write to someone else", async () => {
    await assertFails(setDoc(doc(as(env, ADMIN, "admin"), "budgets/2026-09"), budget(MEMBER)));
  });
});

describe("disabled accounts are locked out", () => {
  it("blocks a disabled user reading expenses", async () => {
    await assertFails(getDoc(doc(as(env, DISABLED, "member"), "expenses/anything")));
  });
});

describe("the audit log is append-only and self-attributed", () => {
  const entry = (uid) => ({ at: serverTimestamp(), by: uid, action: "expense.create", entityId: "e1", summary: "x" });
  it("lets a user record their own action", async () => {
    await assertSucceeds(setDoc(doc(as(env, MEMBER, "member"), "audit/a1"), entry(MEMBER)));
  });
  it("blocks attributing an entry to someone else", async () => {
    await assertFails(setDoc(doc(as(env, MEMBER, "member"), "audit/a2"), entry(ADMIN)));
  });
  it("blocks editing or deleting an existing entry", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "audit/a3"), { at: new Date(), by: MEMBER, action: "x", entityId: "e", summary: "s" });
    });
    const db = as(env, MEMBER, "member");
    await assertFails(updateDoc(doc(db, "audit/a3"), { summary: "rewritten" }));
    await assertFails(deleteDoc(doc(db, "audit/a3")));
  });
});
