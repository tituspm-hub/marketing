// Proves the tracker itself works against the live emulators: a real sign-in, a real
// expense written through the security rules, and the totals the person reads back.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { render, screen, within, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { emulatorReachable, seedOwner, TEST_PASSWORD } from "./support/emulator.js";
const maybe = (await emulatorReachable()) ? describe : describe.skip;

maybe("the budget tracker", () => {
  let App, auth, signOut, adminDb, created = [];

  beforeAll(async () => {
    // Past the forced-change gate, so the test exercises the tracker not the prompt.
    ({ db: adminDb } = await seedOwner({ uid: "sa_yash", mustChangePassword: false }));

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
      await userEvent.type(signInField, "yash");
      await userEvent.type(screen.getByLabelText(/^password$/i), TEST_PASSWORD);
      await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    }
    await screen.findByRole("heading", { name: /marketing budget/i }, { timeout: 20000 });
  }

  it.sequential("signs in and lands on a tracker with real controls, not a placeholder", async () => {
    await openTracker();
    expect(screen.getByRole("heading", { name: /add an expense/i })).toBeInTheDocument();
    // The period overview now lives in the month rail rather than a separate table.
    const rail = screen.getByRole("tablist", { name: /month/i });
    expect(within(rail).getAllByRole("tab")).toHaveLength(6);
    expect(screen.getByRole("heading", { name: /expense ledger/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/what was it for/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^category$/i })).toBeInTheDocument();
  }, 40000);

  it("records an expense and shows it in the ledger and the totals", async () => {
    await openTracker();
    const description = `Vitest spend ${Date.now()}`;
    await userEvent.type(screen.getByLabelText(/what was it for/i), description);
    await userEvent.type(screen.getByRole("textbox", { name: /amount/i }), "12345");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /^category$/i }), "Meta Ads");
    await userEvent.click(screen.getByRole("button", { name: /^add expense$/i }));

    await waitFor(() => expect(screen.getByText(description)).toBeInTheDocument(), { timeout: 15000 });
    const ledger = screen.getByText(description).closest("table");
    expect(within(ledger).getByText(/₹\s?12,345/)).toBeInTheDocument();

    const snap = await adminDb.collection("expenses").where("description", "==", description).get();
    expect(snap.size).toBe(1);
    created.push(snap.docs[0].id);
    // The rules require a well-formed month key derived from the date.
    expect(snap.docs[0].data().month).toMatch(/^\d{4}-\d{2}$/);
    expect(snap.docs[0].data().createdBy).toBe("sa_yash");
  }, 40000);

  it("refuses an expense with no amount and says why", async () => {
    await openTracker();
    await userEvent.type(screen.getByLabelText(/what was it for/i), "Missing amount");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /^category$/i }), "Meta Ads");
    await userEvent.click(screen.getByRole("button", { name: /^add expense$/i }));
    const alert = await screen.findByRole("alert", {}, { timeout: 6000 });
    expect(alert.textContent).toMatch(/amount/i);
  }, 40000);

  it("lists only the four teammates and never the owner account", async () => {
    await openTracker();
    // The shell renders a sidebar and a compact header; CSS hides one, jsdom sees both.
    await userEvent.click(screen.getAllByRole("link", { name: /^team$/i })[0]);
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
