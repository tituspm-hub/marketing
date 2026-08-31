import { useState } from "react";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider.jsx";
import { validatePassword } from "../lib/password.js";
import { callApi } from "../lib/api.js";

// As on the sign-in screen, no Firebase code ever reaches the user.
const MESSAGES = {
  "auth/invalid-credential": "Your current password is not right.",
  "auth/wrong-password": "Your current password is not right.",
  "auth/weak-password": "That password is too easy to guess. Try a longer one.",
  "auth/requires-recent-login": "Sign in again, then change your password.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/network-request-failed": "No connection. Check your internet and try again.",
};

export default function ChangePasswordPage() {
  const { user, username, status, signOut } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const forced = status === "needsPasswordChange";

  async function submit(event) {
    event.preventDefault();
    setError("");

    const check = validatePassword(next);
    if (!check.ok) return setError(check.reason);
    if (next !== confirm) return setError("The two new passwords do not match.");
    if (next === current) return setError("Choose a password you have not used here before.");

    setBusy(true);
    try {
      // Firebase requires a recent sign-in before a password change.
      await reauthenticateWithCredential(
        user, EmailAuthProvider.credential(user.email, current)
      );
      await updatePassword(user, next);
      // Changing the password moves tokensValidAfterTime past this session's auth_time,
      // so requireCaller's checkRevoked would reject the very next API call. Re-auth
      // with the new password mints a token the backend will accept.
      await reauthenticateWithCredential(
        user, EmailAuthProvider.credential(user.email, next)
      );
      await callApi("users/clear-must-change");
      navigate("/", { replace: true });
    } catch (err) {
      setError(MESSAGES[err?.code] ?? "Could not change the password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <img src="/logo.png" alt="Hire3x" className="h-9 w-auto mx-auto mb-6" />
        <div className="bg-white rounded-card shadow-card p-8">
        <h1 className="text-2xl font-extrabold mb-1">
          {forced ? "Set your own password" : "Change password"}
        </h1>
        <p className="text-muted-foreground text-sm mb-6">
          {forced
            ? `Welcome, @${username}. Replace the temporary password you were given.`
            : "Pick something only you know."}
        </p>

        <form onSubmit={submit} noValidate>
          <Field id="current" label={forced ? "Temporary password" : "Current password"}
                 value={current} onChange={setCurrent} autoComplete="current-password" />
          <Field id="next" label="New password" value={next} onChange={setNext}
                 autoComplete="new-password" hint="At least 10 characters, with a number." />
          <Field id="confirm" label="New password again" value={confirm} onChange={setConfirm}
                 autoComplete="new-password" />

          <Requirements value={next} confirm={confirm} />

          {error && (
            <p role="alert" className="text-danger text-sm mb-4 flex gap-2">
              <span aria-hidden="true">⚠</span>
              <span>{error}</span>
            </p>
          )}

          <button type="submit" disabled={busy}
                  className="w-full rounded-full bg-primary text-white font-semibold hover:bg-primary-hover disabled:opacity-60">
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>

        {forced && (
          <button onClick={signOut} className="w-full text-muted-foreground text-xs mt-4">
            Sign out instead
          </button>
        )}
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, autoComplete, hint }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-semibold mb-1">{label}</label>
      <input id={id} type="password" autoComplete={autoComplete} value={value}
             onChange={(e) => onChange(e.target.value)}
             className="w-full rounded-full border border-line px-4 outline-none focus:border-primary" />
      {hint && <p className="text-muted-foreground text-xs mt-1">{hint}</p>}
    </div>
  );
}

// Shown live rather than only on submit, so nobody discovers the rules by failing.
function Requirements({ value, confirm }) {
  const rules = [
    ["At least 10 characters", value.length >= 10],
    ["Contains a letter", /[A-Za-z]/.test(value)],
    ["Contains a number", /[0-9]/.test(value)],
    ["Both entries match", value.length > 0 && value === confirm],
  ];
  return (
    <ul className="mb-4 space-y-1" aria-live="polite">
      {rules.map(([label, met]) => (
        <li key={label} className={`text-xs flex gap-2 ${met ? "text-success" : "text-muted-foreground"}`}>
          <span aria-hidden="true">{met ? "✓" : "○"}</span>
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
