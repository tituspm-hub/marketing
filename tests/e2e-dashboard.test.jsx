// Proves the tracker itself works against the live emulators: a real sign-in, a real
// expense written through the security rules, and the totals the person reads back.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { render, screen, within, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let reachable = false;
try {
  reachable = (await fetch("http://127.0.0.1:9099", { signal: AbortSignal.timeout(2000) })).ok;
} catch { reachable = false; }
const maybe = reachable ? describe : describe.skip;

maybe("the budget tracker", () => {
  let App, auth, signOut, adminDb, created = [];

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    process.env.GCLOUD_PROJECT ??= "demo-hire3x";
    const { initializeApp: initAdmin, getApps } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    if (!getApps().length) initAdmin({ projectId: "demo-hire3x" });
    adminDb = getFirestore();
    // Past the forced-change gate, so the test exercises the tracker not the prompt.
    await adminDb.doc("users/sa_gebin").update({ mustChangePassword: false });

    ({ auth } = await import("../src/lib/firebase.js"));
    ({ signOut } = await import("firebase/auth"));
    ({ default: App } = await import("../src/App.jsx"));
  });

  afterAll(async () => {
    cleanup();
    for (const id of created) await adminDb.doc(`expenses/${id}`).delete().catch(() => {});
    await signOut(auth).catch(() => {});
  });

  // Testing Library unmounts between tests; the Firebase session survives, so after the
  // first sign-in every render lands straight on the tracker.
  async function openTracker() {
    render(<App />);
    const signInField = await screen
      .findByLabelText(/username/i, {}, { timeout: 8000 })
      .catch(() => null);
    if (signInField) {
      await userEvent.type(signInField, "gebin");
      await userEvent.type(screen.getByLabelText(/^password$/i), "asdfghjkl;'");
      await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    }
    await screen.findByRole("heading", { name: /marketing budget/i }, { timeout: 20000 });
  }

  it.sequential("signs in and lands on a tracker with real controls, not a placeholder", async () => {
    await openTracker();
    expect(screen.getByRole("heading", { name: /add an expense/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /six-month overview/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /expense ledger/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/what was it for/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
  }, 40000);

  it("records an expense and shows it in the ledger and the totals", async () => {
    await openTracker();
    const description = `Vitest spend ${Date.now()}`;
    await userEvent.type(screen.getByLabelText(/what was it for/i), description);
    await userEvent.type(screen.getByLabelText(/amount/i), "12345");
    await userEvent.selectOptions(screen.getByLabelText(/category/i), "Meta Ads");
    await userEvent.click(screen.getByRole("button", { name: /^add expense$/i }));

    await waitFor(() => expect(screen.getByText(description)).toBeInTheDocument(), { timeout: 15000 });
    const ledger = screen.getByText(description).closest("table");
    expect(within(ledger).getByText(/₹\s?12,345/)).toBeInTheDocument();

    const snap = await adminDb.collection("expenses").where("description", "==", description).get();
    expect(snap.size).toBe(1);
    created.push(snap.docs[0].id);
    // The rules require a well-formed month key derived from the date.
    expect(snap.docs[0].data().month).toMatch(/^\d{4}-\d{2}$/);
    expect(snap.docs[0].data().createdBy).toBe("sa_gebin");
  }, 40000);

  it("refuses an expense with no amount and says why", async () => {
    await openTracker();
    await userEvent.type(screen.getByLabelText(/what was it for/i), "Missing amount");
    await userEvent.selectOptions(screen.getByLabelText(/category/i), "Meta Ads");
    await userEvent.click(screen.getByRole("button", { name: /^add expense$/i }));
    const alert = await screen.findByRole("alert", {}, { timeout: 6000 });
    expect(alert.textContent).toMatch(/amount/i);
  }, 40000);

  it("lists only the four teammates and never the owner account", async () => {
    await openTracker();
    await userEvent.click(screen.getByRole("link", { name: /^team$/i }));
    await screen.findByRole("heading", { name: /^team$/i }, { timeout: 10000 });
    // onSnapshot emits the empty local cache first; wait for the server round trip.
    await waitFor(
      () => expect(screen.getByText(/4 people can use the tracker/i)).toBeInTheDocument(),
      { timeout: 15000 }
    );

    // The roster renders each person as "Display name @username", so assert on the
    // rendered text rather than on element identity.
    const roster = screen.getByRole("heading", { name: /^team$/i }).closest("div").parentElement
      .parentElement.textContent;
    for (const handle of ["@yash", "@titus", "@shijin", "@madesh"]) {
      expect(roster, handle).toContain(handle);
    }
    expect(roster).not.toContain("@gebin");
    expect(roster).not.toMatch(/@qa|@helper/i);
    expect(roster).toMatch(/4 people can use the tracker/);
  }, 40000);
});
