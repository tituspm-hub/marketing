import { useState } from "react";
import { UserPlus, KeyRound, ShieldCheck, Power, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { callApi } from "../../lib/api.js";
import { canActOn, canAssignRoles, isSuperAdmin, isHiddenAccount } from "../../shared/roles.js";
import { generateTempPassword } from "../../lib/password.js";
import { useTeam } from "./useTeam.js";
import AddTeammateDialog from "./AddTeammateDialog.jsx";

const ROLE_LABEL = { superadmin: "Owner", admin: "Admin", member: "Member" };

export default function TeamPage() {
  const { user, role } = useAuth();
  const { members: allMembers, loading, error } = useTeam();
  // The roster is who uses the tracker. Owner accounts stay out of it entirely.
  const members = allMembers.filter((m) => !isHiddenAccount(m.uid));
  const [adding, setAdding] = useState(false);
  const [busyUid, setBusyUid] = useState(null);

  async function run(uid, label, fn) {
    setBusyUid(uid);
    try {
      await fn();
      toast.success(label);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyUid(null);
    }
  }

  const resetPassword = (m) => {
    const tempPassword = generateTempPassword();
    return run(m.uid, "Password reset", async () => {
      await callApi("users/reset-password", { uid: m.uid, tempPassword });
      await navigator.clipboard?.writeText(
        `Your budget tracker password was reset.\nUsername: ${m.username}\nTemporary password: ${tempPassword}`
      );
      toast.info("Handover message copied to your clipboard.");
    });
  };

  if (loading) return <p className="text-muted-foreground">Loading the team…</p>;
  if (error) return <p role="alert" className="text-danger">{error}</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.14em] text-primary">ACCESS</p>
          <h1 className="text-[32px] leading-[1.1] font-extrabold tracking-tight mt-1">Team</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {members.length} {members.length === 1 ? "person" : "people"} can use the tracker.
          </p>
        </div>
        <button onClick={() => setAdding(true)}
                className="inline-flex items-center gap-2 rounded-full bg-primary text-white font-semibold px-5 hover:bg-primary-hover transition-colors shadow-lift">
          <UserPlus className="size-4" />
          Add teammate
        </button>
      </header>

      <div className="bg-white rounded-card shadow-card divide-y divide-line overflow-hidden">
        {members.map((m) => {
          const locked = isSuperAdmin(m.uid);
          const actionable = canActOn({
            actorUid: user.uid, actorRole: role, targetUid: m.uid, targetRole: m.role,
          });
          return (
            <div key={m.uid} className="group flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors">
              <span className={`grid place-items-center size-10 rounded-xl font-extrabold text-sm shrink-0 ${
                locked ? "bg-accent text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {(m.displayName ?? m.username ?? "?").slice(0, 1).toUpperCase()}
              </span>

              <div className="flex-1 min-w-[140px]">
                <div className="font-semibold flex items-center gap-1.5">
                  {m.displayName}
                  {locked && <Lock className="size-3 text-muted-foreground" aria-label="Permanent account" />}
                </div>
                <div className="text-muted-foreground text-xs">@{m.username}</div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Pill tone={locked ? "primary" : m.role === "admin" ? "primary" : "muted"}>
                  {ROLE_LABEL[m.role] ?? "Member"}
                </Pill>
                {m.disabled && <Pill tone="danger">Switched off</Pill>}
                {m.mustChangePassword && <Pill tone="warn">Password not set</Pill>}
              </div>

              {actionable ? (
                <div className="flex gap-1.5 shrink-0 ml-auto">
                  <RowButton icon={KeyRound} busy={busyUid === m.uid} onClick={() => resetPassword(m)}>
                    Reset password
                  </RowButton>
                  {canAssignRoles(role) && (
                    <RowButton icon={ShieldCheck} busy={busyUid === m.uid}
                               onClick={() => run(m.uid, "Role updated", () =>
                                 callApi("users/set-role", {
                                   uid: m.uid, role: m.role === "admin" ? "member" : "admin",
                                 }))}>
                      {m.role === "admin" ? "Make member" : "Make admin"}
                    </RowButton>
                  )}
                  <RowButton icon={Power} danger busy={busyUid === m.uid}
                             onClick={() => run(m.uid, m.disabled ? "Re-enabled" : "Switched off", () =>
                               callApi("users/set-disabled", { uid: m.uid, disabled: !m.disabled }))}>
                    {m.disabled ? "Turn back on" : "Switch off"}
                  </RowButton>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                  {locked ? "Permanent" : "No actions available"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <AddTeammateDialog open={adding} onClose={() => setAdding(false)}
                         canAssignRoles={canAssignRoles(role)} />
    </div>
  );
}

function Pill({ children, tone = "muted" }) {
  const tones = {
    primary: "bg-accent text-primary",
    muted: "bg-muted text-muted-foreground",
    danger: "bg-danger/10 text-danger",
    warn: "bg-warn/10 text-warn",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

function RowButton({ children, onClick, icon: Icon, danger, busy }) {
  return (
    <button onClick={onClick} disabled={busy} data-compact title={children}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
              danger
                ? "border-line text-danger hover:bg-danger hover:text-white hover:border-danger"
                : "border-line text-muted-foreground hover:border-primary hover:text-primary"
            }`}>
      <Icon className="size-3.5" />
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}
