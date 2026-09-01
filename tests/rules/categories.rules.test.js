// tests/rules/categories.rules.test.js
// Categories are the one collection an ordinary member may add to: naming a spend
// bucket is part of logging the spend. These rules keep that from becoming a hole.
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { makeEnv, seed, as, ADMIN, MEMBER, DISABLED } from "./helpers.js";

let env;
beforeAll(async () => { env = await makeEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(env); });

const memberDb = () => as(env, MEMBER, "member");
const category = (uid, over = {}) => ({
  label: "Podcast sponsorships",
  createdBy: uid,
  createdAt: serverTimestamp(),
  ...over,
});

describe("adding a category", () => {
  it("accepts a well-formed category from any active member", async () => {
    await assertSucceeds(setDoc(doc(memberDb(), "categories/podcast"), category(MEMBER)));
  });

  it("rejects attributing the category to someone else", async () => {
    await assertFails(setDoc(doc(memberDb(), "categories/podcast"),
      category(MEMBER, { createdBy: ADMIN })));
  });

  it("rejects a back-dated or client-chosen createdAt", async () => {
    await assertFails(setDoc(doc(memberDb(), "categories/podcast"),
      category(MEMBER, { createdAt: new Date("2020-01-01T00:00:00Z") })));
  });

  it("rejects an empty label, a non-string label, and an over-long one", async () => {
    for (const [id, label] of [["a", ""], ["b", 42], ["c", "x".repeat(61)]]) {
      await assertFails(setDoc(doc(memberDb(), `categories/${id}`), category(MEMBER, { label })));
    }
  });

  it("rejects extra keys, which is how a colour or a flag would smuggle in", async () => {
    await assertFails(setDoc(doc(memberDb(), "categories/podcast"),
      category(MEMBER, { budget: 100000 })));
  });

  it("rejects a category with no label at all", async () => {
    await assertFails(setDoc(doc(memberDb(), "categories/podcast"),
      { createdBy: MEMBER, createdAt: serverTimestamp() }));
  });

  it("rejects a switched-off account", async () => {
    await assertFails(setDoc(doc(as(env, DISABLED, "member"), "categories/podcast"),
      category(DISABLED)));
  });

  it("rejects a signed-out visitor", async () => {
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), "categories/podcast"),
      category(MEMBER)));
  });
});

describe("changing a category", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "categories/podcast"),
        { label: "Podcast sponsorships", createdBy: MEMBER, createdAt: new Date() });
    });
  });

  it("refuses a rename by anyone, since it would relabel every expense already filed", async () => {
    await assertFails(updateDoc(doc(memberDb(), "categories/podcast"), { label: "Something else" }));
    await assertFails(updateDoc(doc(as(env, ADMIN, "admin"), "categories/podcast"),
      { label: "Something else" }));
  });

  it("lets an admin remove one but not a member", async () => {
    await assertFails(deleteDoc(doc(memberDb(), "categories/podcast")));
    await assertSucceeds(deleteDoc(doc(as(env, ADMIN, "admin"), "categories/podcast")));
  });

  it("is readable by any active member", async () => {
    const snap = await assertSucceeds(getDoc(doc(memberDb(), "categories/podcast")));
    expect(snap.data().label).toBe("Podcast sponsorships");
  });
});
