import { adminAuth, adminDb } from "../_lib/admin";
import { handle, HttpError, requireString } from "../_lib/http";
import { requireCaller, requireTarget, writeAudit, passwordStamp } from "../_lib/guard";
import { validatePassword } from "../../src/lib/password.js";
import { canManageUsers } from "../../src/shared/roles.js";

export default handle(async (req) => {
  const caller = await requireCaller(req);
  if (!canManageUsers(caller.role)) throw new HttpError(403, "Only admins can reset passwords.");

  const targetUid = requireString(req.body, "uid", 128);
  const tempPassword = requireString(req.body, "tempPassword", 128);

  const check = validatePassword(tempPassword);
  if (!check.ok) throw new HttpError(400, check.reason);

  const target = await requireTarget(caller, targetUid);

  // The flag is raised first: if the password change then fails, the teammate is
  // prompted to change a password they still know, which the prompt itself repairs.
  // The reverse order would leave a temp password the admin knows and no prompt.
  await adminDb().doc(`users/${targetUid}`).update({ mustChangePassword: true });
  await adminAuth().updateUser(targetUid, { password: tempPassword });
  // Force every existing session of that account to re-authenticate.
  await adminAuth().revokeRefreshTokens(targetUid);

  const passwordSetAt = await passwordStamp(targetUid);
  await adminDb().doc(`users/${targetUid}`).update({ passwordSetAt });

  await writeAudit({
    by: caller.uid, byUsername: caller.username,
    action: "user.passwordReset", entityId: targetUid,
    summary: `Reset the password for @${target.data.username}`,
  });

  return { ok: true };
});
