// Proves the tracker itself works against the live emulators: a real sign-in, a real
// expense written through the security rules, and the totals the person reads back.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { render, screen, within, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { emulatorReachable, seedOwner, restoreAccount, TEST_PASSWORD } from "./support/emulator.js";
const maybe = (await emulatorReachable()) ? describe : describe.skip;

maybe("the budget tracker", () => {
  let App, auth, signOut, adminDb;
  const created = [];
  const categories = [];

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
    for (const id of categories) await adminDb.doc(`categories/${id}`).delete().catch(() => {});
    await signOut(auth).catch(() => {});
    // Borrowing the account must not leave it signed in with a test password.
    await restoreAccount("sa_yash").catch(() => {});
  });

  // Testing Library unmounts between tests; the Firebase session survives, so after the
  // first sign-in every render lands straight on the tracker.
  async function openTracker() {
    // BrowserRouter reads the real jsdom URL, which survives unmount. Without this a
    // test that ended on the ledger starts the next one there.
    window.history.pushState({}, "", "/");
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

  async function openLedger() {
    await userEvent.click(screen.getAllByRole("link", { name: /^ledger$/i })[0]);
    return screen.findByRole("heading", { name: /expense ledger/i }, { timeout: 15000 });
  }

  it.sequential("signs in and lands on an overview built around the form", async () => {
    await openTracker();
    expect(screen.getByRole("heading", { name: /add an expense/i })).toBeInTheDocument();
    // The period overview lives in the month rail rather than a separate table.
    const rail = screen.getByRole("tablist", { name: /month/i });
    expect(within(rail).getAllByRole("tab")).toHaveLength(6);
    expect(screen.getByLabelText(/what was it for/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /amount/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^category$/i })).toBeInTheDocument();
    // The ledger moved to its own page so the form gets the width.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^ledger$/i }).length).toBeGreaterThan(0);
  }, 40000);

  it("records an expense and shows it on the ledger page", async () => {
    await openTracker();
    const description = `Vitest spend ${Date.now()}`;
    await userEvent.type(screen.getByLabelText(/what was it for/i), description);
    await userEvent.type(screen.getByRole("textbox", { name: /amount/i }), "12345");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /^category$/i }), "Meta Ads");
    await userEvent.click(screen.getByRole("button", { name: /^add expense$/i }));

    const snap = await waitFor(async () => {
      const found = await adminDb.collection("expenses").where("description", "==", description).get();
      expect(found.size).toBe(1);
      return found;
    }, { timeout: 15000 });
    created.push(snap.docs[0].id);
    // The rules require a well-formed month key derived from the date.
    expect(snap.docs[0].data().month).toMatch(/^\d{4}-\d{2}$/);
    expect(snap.docs[0].data().createdBy).toBe("sa_yash");

    await openLedger();
    await waitFor(() => expect(screen.getByText(description)).toBeInTheDocument(), { timeout: 15000 });
    const table = screen.getByText(description).closest("table");
    expect(within(table).getByText(/₹\s?12,345/)).toBeInTheDocument();
  }, 60000);

  it("narrows the ledger with the search box and puts it back", async () => {
    await openTracker();
    await openLedger();
    const rows = () => within(screen.getByRole("table")).getAllByRole("row").length - 1;
    await waitFor(() => expect(rows()).toBeGreaterThan(0), { timeout: 15000 });

    await userEvent.type(screen.getByRole("textbox", { name: /search expenses/i }),
      "zzz-nothing-matches-this");
    await screen.findByText(/nothing matches that/i, {}, { timeout: 6000 });

    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    await waitFor(() => expect(rows()).toBeGreaterThan(0));
  }, 60000);

  it("hands an edit from the ledger back to the form on the overview", async () => {
    await openTracker();
    const description = `Vitest handoff ${Date.now()}`;
    await userEvent.type(screen.getByLabelText(/what was it for/i), description);
    await userEvent.type(screen.getByRole("textbox", { name: /amount/i }), "777");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /^category$/i }), "Meta Ads");
    await userEvent.click(screen.getByRole("button", { name: /^add expense$/i }));

    const snap = await waitFor(async () => {
      const found = await adminDb.collection("expenses").where("description", "==", description).get();
      expect(found.size).toBe(1);
      return found;
    }, { timeout: 15000 });
    created.push(snap.docs[0].id);

    await openLedger();
    const cell = await screen.findByText(description, {}, { timeout: 15000 });
    await userEvent.click(within(cell.closest("tr")).getByRole("button", { name: /^edit /i }));

    await screen.findByRole("heading", { name: /edit expense/i }, { timeout: 15000 });
    expect(screen.getByLabelText(/what was it for/i)).toHaveValue(description);
    // The intent is consumed, so a refresh does not drop back into the same edit.
    expect(window.location.search).not.toMatch(/edit=/);

    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.getByLabelText(/what was it for/i)).toHaveValue("");
  }, 60000);

  it("refuses an expense with no amount and says why", async () => {
    await openTracker();
    await userEvent.type(screen.getByLabelText(/what was it for/i), "Missing amount");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /^category$/i }), "Meta Ads");
    await userEvent.click(screen.getByRole("button", { name: /^add expense$/i }));
    const alert = await screen.findByRole("alert", {}, { timeout: 6000 });
    expect(alert.textContent).toMatch(/amount/i);
  }, 40000);

  it("adds a category through Other and files an expense under it", async () => {
    await openTracker();
    const label = `Vitest bucket ${Date.now()}`;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    await userEvent.click(screen.getByRole("radio", { name: /^other$/i }));
    await userEvent.type(screen.getByLabelText(/new category name/i), label);
    await userEvent.click(screen.getByRole("button", { name: /add category/i }));

    // The chip list is fed by the live collection, so its arrival proves the write.
    await screen.findByRole("radio", { name: label }, { timeout: 15000 });
    categories.push(id);
    const stored = await adminDb.doc(`categories/${id}`).get();
    expect(stored.exists).toBe(true);
    expect(stored.data().createdBy).toBe("sa_yash");

    const description = `Vitest other ${Date.now()}`;
    await userEvent.type(screen.getByLabelText(/what was it for/i), description);
    await userEvent.type(screen.getByRole("textbox", { name: /amount/i }), "500");
    await userEvent.click(screen.getByRole("button", { name: /^add expense$/i }));

    const snap = await waitFor(async () => {
      const found = await adminDb.collection("expenses").where("description", "==", description).get();
      expect(found.size).toBe(1);
      return found;
    }, { timeout: 15000 });
    created.push(snap.docs[0].id);
    expect(snap.docs[0].data().category).toBe(label);
  }, 60000);

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
