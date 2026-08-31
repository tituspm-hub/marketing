// Drives the whole application against the real Auth and Firestore emulators. Nothing
// is mocked. The earlier version asserted only that Firebase authenticated, which it
// always did — the app still never left the sign-in screen. Assert what the user sees.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { emulatorReachable, seedOwner, TEST_PASSWORD } from "./support/emulator.js";
const maybe = (await emulatorReachable()) ? describe : describe.skip;

maybe("the sign-in journey a person actually walks", () => {
  let App, auth, signOut;

  beforeAll(async () => {
    // Forced-change on, so the destination after sign-in is deterministic.
    await seedOwner({ uid: "sa_titus", mustChangePassword: true });
    ({ auth } = await import("../src/lib/firebase.js"));
    ({ signOut } = await import("firebase/auth"));
    ({ default: App } = await import("../src/App.jsx"));
  });

  afterEach(async () => { cleanup(); await signOut(auth).catch(() => {}); });

  async function signIn(username, password) {
    render(<App />);
    await screen.findByLabelText(/username/i, {}, { timeout: 8000 });
    await userEvent.type(screen.getByLabelText(/username/i), username);
    await userEvent.type(screen.getByLabelText(/password/i), password);
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
  }

  it("leaves the sign-in screen once the credentials are accepted", async () => {
    await signIn("titus", TEST_PASSWORD);
    // Which screen comes next depends on whether the forced-change flag is still set,
    // which another suite may have cleared. The invariant under test is only that the
    // form does not sit there doing nothing, so assert on leaving it.
    // Wait for a destination, not for the button to vanish: the loading screen also
    // removes the button, so that alone would pass while still going nowhere.
    await screen.findByRole("heading", { name: /set your own password/i }, { timeout: 20000 });

    expect(screen.queryByRole("button", { name: /^sign in$/i })).toBeNull();
  }, 30000);

  it("says what went wrong when the password is wrong", async () => {
    await signIn("gebin", "definitely-not-it-9");
    const alert = await screen.findByRole("alert", {}, { timeout: 10000 });
    expect(alert.textContent).toMatch(/username or password/i);
    expect(alert.textContent).not.toMatch(/auth\//);
  }, 30000);

  it("says what went wrong for a username nobody has", async () => {
    await signIn("nobodyhere", "definitely-not-it-9");
    const alert = await screen.findByRole("alert", {}, { timeout: 10000 });
    expect(alert.textContent.length).toBeGreaterThan(0);
  }, 30000);

  it("refuses a malformed username without a network round trip", async () => {
    await signIn("ya sh", "whatever-123");
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert.textContent).toMatch(/letters, numbers|lowercase|start with/i);
  }, 30000);

  it("names the empty field rather than failing silently", async () => {
    render(<App />);
    await screen.findByLabelText(/username/i, {}, { timeout: 8000 });
    await userEvent.type(screen.getByLabelText(/username/i), "titus");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert.textContent).toMatch(/password/i);
  }, 30000);
});
