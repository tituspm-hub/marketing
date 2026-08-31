// tests/rules/expenses.rules.test.js
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { makeEnv, seed, as, validExpense, ADMIN, MEMBER } from "./helpers.js";

let env;
beforeAll(async () => { env = await makeEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(env); });

const memberDb = () => as(env, MEMBER, "member");

describe("expense creation", () => {
  it("accepts a well-formed expense from any active member", async () => {
    await assertSucceeds(setDoc(doc(memberDb(), "expenses/e1"), validExpense(MEMBER)));
  });
  it("rejects attributing the expense to another user", async () => {
    await assertFails(setDoc(doc(memberDb(), "expenses/e2"),
      validExpense(MEMBER, { createdBy: ADMIN })));
  });
  it("rejects a month that disagrees with the date", async () => {
    await assertFails(setDoc(doc(memberDb(), "expenses/e3"),
      validExpense(MEMBER, { date: "2026-09-12", month: "2026-10" })));
  });
  it("rejects a date outside the configured period", async () => {
    await assertFails(setDoc(doc(memberDb(), "expenses/e4"),
      validExpense(MEMBER, { date: "2027-06-01", month: "2027-06" })));
  });
  it("rejects zero, negative, and absurd amounts", async () => {
    for (const amount of [0, -100, 100000001]) {
      await assertFails(setDoc(doc(memberDb(), `expenses/amt${amount}`),
        validExpense(MEMBER, { amount })));
    }
  });
  it("rejects a string amount, which would break every total", async () => {
    await assertFails(setDoc(doc(memberDb(), "expenses/e5"),
      validExpense(MEMBER, { amount: "25000" })));
  });
  it("rejects an empty or over-long description", async () => {
    await assertFails(setDoc(doc(memberDb(), "expenses/e6"),
      validExpense(MEMBER, { description: "" })));
    await assertFails(setDoc(doc(memberDb(), "expenses/e7"),
      validExpense(MEMBER, { description: "x".repeat(201) })));
  });
  it("rejects unknown fields, so no client can smuggle data in", async () => {
    await assertFails(setDoc(doc(memberDb(), "expenses/e8"),
      validExpense(MEMBER, { approved: true })));
  });
});

describe("expense updates", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "expenses/e1"), validExpense(MEMBER));
    });
  });
  it("lets a different teammate edit and stamps them as the editor", async () => {
    await assertSucceeds(setDoc(doc(as(env, ADMIN, "admin"), "expenses/e1"),
      validExpense(MEMBER, { updatedBy: ADMIN, description: "Revised" })));
  });
  it("rejects an edit that does not stamp the real editor", async () => {
    await assertFails(setDoc(doc(as(env, ADMIN, "admin"), "expenses/e1"),
      validExpense(MEMBER, { description: "Revised" })));
  });
  it("rejects rewriting the original author", async () => {
    await assertFails(setDoc(doc(as(env, ADMIN, "admin"), "expenses/e1"),
      validExpense(MEMBER, { createdBy: ADMIN, updatedBy: ADMIN })));
  });
  it("lets any active member delete", async () => {
    await assertSucceeds(deleteDoc(doc(memberDb(), "expenses/e1")));
  });
});

describe("signed-out access", () => {
  it("is refused everywhere", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anon, "expenses/x"), validExpense("nobody")));
    await assertFails(setDoc(doc(anon, "audit/x"), { by: "nobody" }));
  });
});
