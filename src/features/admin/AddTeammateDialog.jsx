import { useState } from "react";
import { validateUsername } from "../../lib/username.js";
import { generateTempPassword, validatePassword } from "../../lib/password.js";
import { callApi } from "../../lib/api.js";

export default function AddTeammateDialog({ open, onClose, canAssignRoles, onCreated }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tempPassword, setTempPassword] = useState(() => generateTempPassword());
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  if (!open) return null;

  async function submit(event) {
    event.preventDefault();
    setError("");

    const name = validateUsername(username.trim().toLowerCase());
    if (!name.ok) return setError(name.reason);
    if (!displayName.trim()) return setError("Enter their full name.");
    const pw = validatePassword(tempPassword);
    if (!pw.ok) return setError(pw.reason);

    setBusy(true);
    try {
      await callApi("users/create", {
        username: username.trim().toLowerCase(),
        displayName: displayName.trim(),
        tempPassword,
        role,
      });
      setCreated({ username: username.trim().toLowerCase(), tempPassword });
      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const message =
      `You're set up on the Hire3x budget tracker.\n` +
      `Username: ${created.username}\n` +
      `Temporary password: ${created.tempPassword}\n` +
      `You'll be asked to pick your own password when you sign in.`;
    return (
      <Panel title={`@${created.username} is ready`} onClose={onClose}>
        <p className="text-muted-foreground text-sm mb-3">Send them this message.</p>
        <pre data-testid="handover"
             className="bg-surface rounded-card p-4 text-sm whitespace-pre-wrap mb-4">
          {message}
        </pre>
        <button onClick={() => navigator.clipboard?.writeText(message)}
                className="w-full rounded-full bg-primary text-white font-semibold mb-2">
          Copy message
        </button>
        <button onClick={onClose} className="w-full rounded-full border border-line font-semibold">
          Done
        </button>
      </Panel>
    );
  }

  return (
    <Panel title="Add a teammate" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Text id="username" label="Username" value={username} onChange={setUsername}
              hint="Lowercase, no spaces. This is what they type to sign in." />
        <Text id="displayName" label="Full name" value={displayName} onChange={setDisplayName} />

        <div className="mb-4">
          <label htmlFor="tempPassword" className="block text-sm font-semibold mb-1">
            Temporary password
          </label>
          <div className="flex gap-2">
            <input id="tempPassword" value={tempPassword}
                   onChange={(e) => setTempPassword(e.target.value)}
                   className="flex-1 rounded-full border border-line px-4" />
            <button type="button" onClick={() => setTempPassword(generateTempPassword())}
                    className="px-4 rounded-full border border-line text-sm font-semibold">
              Generate
            </button>
          </div>
          <p className="text-muted-foreground text-xs mt-1">They must change this on first sign-in.</p>
        </div>

        {canAssignRoles && (
          <div className="mb-4">
            <label htmlFor="role" className="block text-sm font-semibold mb-1">Role</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-full border border-line px-4">
              <option value="member">Member — logs expenses</option>
              <option value="admin">Admin — also sets budgets and adds people</option>
            </select>
          </div>
        )}

        {error && <p role="alert" className="text-danger text-sm mb-4">{error}</p>}

        <button type="submit" disabled={busy}
                className="w-full rounded-full bg-primary text-white font-semibold disabled:opacity-60">
          {busy ? "Adding…" : "Add teammate"}
        </button>
      </form>
    </Panel>
  );
}

function Panel({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-ink/40 grid place-items-center p-4 z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-card shadow-card p-6 w-full max-w-md">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground px-2">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Text({ id, label, value, onChange, hint }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-semibold mb-1">{label}</label>
      <input id={id} value={value} autoCapitalize="none" autoCorrect="off"
             onChange={(e) => onChange(e.target.value)}
             className="w-full rounded-full border border-line px-4" />
      {hint && <p className="text-muted-foreground text-xs mt-1">{hint}</p>}
    </div>
  );
}
