import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase.js";
import { toAuthEmail, validateUsername } from "../lib/username.js";

// Firebase error codes are never shown to the user; each maps to one plain sentence.
const MESSAGES = {
  "auth/invalid-credential": "That username or password is not right.",
  "auth/wrong-password": "That username or password is not right.",
  "auth/user-not-found": "That username or password is not right.",
  "auth/user-disabled": "This account has been switched off. Ask Yash or Titus.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/network-request-failed": "No connection. Check your internet and try again.",
};

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");

    const check = validateUsername(username);
    if (!check.ok) return setError(check.reason);
    if (!password) return setError("Enter your password.");

    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, toAuthEmail(username), password);
    } catch (err) {
      setError(MESSAGES[err?.code] ?? "Could not sign in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-surface px-4">
      <div className="w-full max-w-sm bg-white rounded-card shadow-card p-8">
        <h1 className="text-2xl font-extrabold mb-1">Budget tracker</h1>
        <p className="text-muted-foreground text-sm mb-6">Hire3x Marketing</p>

        <form onSubmit={submit} noValidate>
          <label htmlFor="username" className="block text-sm font-semibold mb-1">
            Username
          </label>
          <input
            id="username"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            className="w-full rounded-full border border-line px-4 mb-4"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label htmlFor="password" className="block text-sm font-semibold mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="w-full rounded-full border border-line px-4 mb-5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p role="alert" className="text-danger text-sm mb-4">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-primary text-white font-semibold hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-muted-foreground text-xs mt-6 text-center">
          Forgot your password? Ask Yash or Titus to set a new one for you.
        </p>
      </div>
    </div>
  );
}
