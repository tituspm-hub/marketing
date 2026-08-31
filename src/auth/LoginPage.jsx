import { useRef, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase.js";
import { toAuthEmail, validateUsername } from "../lib/username.js";

// Firebase error codes are never shown to the user; each maps to one plain sentence.
const MESSAGES = {
  "auth/invalid-credential": "That username or password is not right.",
  "auth/wrong-password": "That username or password is not right.",
  "auth/user-not-found": "That username or password is not right.",
  "auth/invalid-email": "That username or password is not right.",
  "auth/user-disabled": "This account has been switched off. Ask Yash or Titus.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/network-request-failed": "No connection. Check your internet and try again.",
};

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState(null);
  const [busy, setBusy] = useState(false);
  const usernameRef = useRef(null);
  const passwordRef = useRef(null);

  // Named so the message and the highlighted field can never disagree.
  function fail(field, reason) {
    setError(reason);
    setInvalidField(field);
    (field === "username" ? usernameRef : passwordRef).current?.focus();
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setInvalidField(null);

    const trimmed = username.trim().toLowerCase();
    if (!trimmed) return fail("username", "Enter your username.");
    const check = validateUsername(trimmed);
    if (!check.ok) return fail("username", check.reason);
    if (!password) return fail("password", "Enter your password.");

    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, toAuthEmail(trimmed), password);
      // No navigation here on purpose: RedirectIfSignedIn moves off this screen the
      // moment AuthProvider sees the session, so there is one place that decides where.
    } catch (err) {
      fail("password", MESSAGES[err?.code] ?? "Could not sign in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5 justify-center mb-7">
          <img src="/logo.png" alt="" className="size-8" />
          <span className="font-display font-extrabold text-lg tracking-tight">Hire3x</span>
        </div>

        <div className="bg-white rounded-card shadow-card p-8">
          <p className="text-[10px] font-bold tracking-[0.14em] text-primary">MARKETING</p>
          <h1 className="text-[26px] leading-tight font-extrabold tracking-tight mt-1.5">
            Budget tracker
          </h1>
          <p className="text-muted-foreground text-sm mt-1 mb-6">
            Sign in with the username your team uses.
          </p>

          <form onSubmit={submit} noValidate>
            <Field
              id="username"
              label="Username"
              inputRef={usernameRef}
              value={username}
              onChange={(v) => { setUsername(v); if (invalidField === "username") setInvalidField(null); }}
              invalid={invalidField === "username"}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              autoComplete="username"
              hint="Just your name — no spaces, no address."
            />
            <Field
              id="password"
              label="Password"
              type="password"
              inputRef={passwordRef}
              value={password}
              onChange={(v) => { setPassword(v); if (invalidField === "password") setInvalidField(null); }}
              invalid={invalidField === "password"}
              autoComplete="current-password"
            />

            {error && (
              <p role="alert" className="text-danger text-sm mb-4 flex gap-2">
                <span aria-hidden="true">⚠</span>
                <span>{error}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-primary text-white font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60 shadow-lift mt-1"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="text-muted-foreground text-xs mt-6 text-center">
            Forgot your password? Ask Yash or Titus to set a new one for you.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, invalid, hint, inputRef, type = "text", ...rest }) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-semibold mb-1">{label}</label>
      <input
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={hintId}
        className={`w-full rounded-xl border px-3.5 text-sm outline-none transition-colors ${
          invalid ? "border-danger bg-danger/[0.03]" : "border-line focus:border-primary"
        }`}
        {...rest}
      />
      {hint && <p id={hintId} className="text-muted-foreground text-xs mt-1">{hint}</p>}
    </div>
  );
}
