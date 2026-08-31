import { useState } from "react";
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">Team</h1>
          <p className="text-muted-foreground text-sm">{members.length} people can use the tracker.</p>
        </div>
        <button onClick={() => setAdding(true)}
                className="rounded-full bg-primary text-white font-semibold px-5">
          Add teammate
        </button>
      </div>

      <div className="bg-white rounded-card shadow-card divide-y divide-line">
        {members.map((m) => {
          const locked = isSuperAdmin(m.uid);
          const actionable = canActOn({
            actorUid: user.uid, actorRole: role, targetUid: m.uid, targetRole: m.role,
          });
          return (
            <div key={m.uid} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="font-semibold">
                  {m.displayName}{" "}
                  <span className="text-muted-foreground font-normal">@{m.username}</span>
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  {ROLE_LABEL[m.role] ?? "Member"}
                  {locked && " · permanent, cannot be removed"}
                  {m.disabled && " · switched off"}
                  {m.mustChangePassword && " · has not set their own password yet"}
                </div>
              </div>

              {actionable && (
                <div className="flex gap-2 shrink-0">
                  <button disabled={busyUid === m.uid} onClick={() => resetPassword(m)}
                          className="text-sm font-semibold px-4 rounded-full border border-line">
                    Reset password
                  </button>
                  {canAssignRoles(role) && (
                    <button disabled={busyUid === m.uid}
                            onClick={() => run(m.uid, "Role updated", () =>
                              callApi("users/set-role", {
                                uid: m.uid, role: m.role === "admin" ? "member" : "admin",
                              }))}
                            className="text-sm font-semibold px-4 rounded-full border border-line">
                      {m.role === "admin" ? "Make member" : "Make admin"}
                    </button>
                  )}
                  <button disabled={busyUid === m.uid}
                          onClick={() => run(m.uid, m.disabled ? "Re-enabled" : "Switched off", () =>
                            callApi("users/set-disabled", { uid: m.uid, disabled: !m.disabled }))}
                          className="text-sm font-semibold px-4 rounded-full border border-line text-danger">
                    {m.disabled ? "Turn back on" : "Switch off"}
                  </button>
                </div>
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
