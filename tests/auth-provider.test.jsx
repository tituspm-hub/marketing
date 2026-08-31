import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

let authCallback;
let profileCallback;

vi.mock("../src/lib/firebase.js", () => ({
  auth: {},
  db: {},
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_a, cb) => { authCallback = cb; return () => {}; },
  signOut: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  doc: () => ({}),
  onSnapshot: (_ref, cb) => { profileCallback = cb; return () => {}; },
}));
vi.mock("../src/shared/roles.js", () => ({
  effectiveRole: (uid, stored) => (uid === "uid_super" ? "superadmin" : stored ?? "member"),
}));

const { AuthProvider, useAuth } = await import("../src/auth/AuthProvider.jsx");

function Probe() {
  const { status, role, username } = useAuth();
  return <div>{status}|{role}|{username}</div>;
}
const renderProbe = () => render(<AuthProvider><Probe /></AuthProvider>);
// act() so the state update flushes and the profile subscription effect actually runs
// before the next emit; without it profileCallback is still unset.
const emitAuth = (user) => act(() => { authCallback(user); });
const emitProfile = (data) =>
  act(() => { profileCallback({ exists: () => !!data, data: () => data }); });

describe("AuthProvider", () => {
  beforeEach(() => { authCallback = null; profileCallback = null; });

  it("starts in the loading state so no screen flashes before the session is known", () => {
    renderProbe();
    expect(screen.getByText(/^loading\|/)).toBeInTheDocument();
  });

  it("reports signedOut when there is no session", async () => {
    renderProbe();
    emitAuth(null);
    await waitFor(() => expect(screen.getByText(/^signedOut\|/)).toBeInTheDocument());
  });

  it("reports needsPasswordChange ahead of ready, so the gate cannot be skipped", async () => {
    renderProbe();
    emitAuth({ uid: "uid_m", email: "shijin@team.hire3x.com" });
    emitProfile({ username: "shijin", role: "member", mustChangePassword: true, disabled: false });
    await waitFor(() =>
      expect(screen.getByText(/^needsPasswordChange\|/)).toBeInTheDocument());
  });

  it("reports ready with the resolved role once the flag is cleared", async () => {
    renderProbe();
    emitAuth({ uid: "uid_m", email: "shijin@team.hire3x.com" });
    emitProfile({ username: "shijin", role: "member", mustChangePassword: false, disabled: false });
    await waitFor(() =>
      expect(screen.getByText("ready|member|shijin")).toBeInTheDocument());
  });

  it("overrides a stored role for a listed super-admin", async () => {
    renderProbe();
    emitAuth({ uid: "uid_super", email: "yash@team.hire3x.com" });
    emitProfile({ username: "yash", role: "member", mustChangePassword: false, disabled: false });
    await waitFor(() =>
      expect(screen.getByText("ready|superadmin|yash")).toBeInTheDocument());
  });

  it("signs a user out the moment their profile is disabled", async () => {
    const { signOut } = await import("firebase/auth");
    renderProbe();
    emitAuth({ uid: "uid_m", email: "shijin@team.hire3x.com" });
    emitProfile({ username: "shijin", role: "member", mustChangePassword: false, disabled: true });
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("signs a user out when they have no profile document at all", async () => {
    const { signOut } = await import("firebase/auth");
    renderProbe();
    emitAuth({ uid: "uid_ghost", email: "ghost@team.hire3x.com" });
    emitProfile(null);
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});
