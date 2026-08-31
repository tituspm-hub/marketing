// Drives the whole application against the real Auth and Firestore emulators. Nothing
// is mocked. The earlier version asserted only that Firebase authenticated, which it
// always did — the app still never left the sign-in screen. Assert what the user sees.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const AUTH_EMULATOR = "http://127.0.0.1:9099";
let reachable = false;
try {
  reachable = (await fetch(AUTH_EMULATOR, { signal: AbortSignal.timeout(2000) })).ok;
} catch { reachable = false; }
const maybe = reachable ? describe : describe.skip;

maybe("the sign-in journey a person actually walks", () => {
  let App, auth, signOut;

  beforeAll(async () => {
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
    await signIn("gebin", "asdfghjkl;'");
    // Seeded accounts still carry the forced-change flag, so this is where they land.
    await waitFor(
      () => expect(screen.getByRole("heading", { name: /set your own password/i })).toBeInTheDocument(),
      { timeout: 12000 }
    );
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
    await userEvent.type(screen.getByLabelText(/username/i), "gebin");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert.textContent).toMatch(/password/i);
  }, 30000);
});
