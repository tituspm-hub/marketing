import { adminAuth, adminDb } from "../_lib/admin";
import { handle, HttpError, requireString } from "../_lib/http";
import { requireCaller, requireTarget, writeAudit } from "../_lib/guard";
import { canManageUsers } from "../../src/shared/roles.js";

export default handle(async (req) => {
  const caller = await requireCaller(req);
  if (!canManageUsers(caller.role)) throw new HttpError(403, "Only admins can do that.");

  const targetUid = requireString(req.body, "uid", 128);
  const disabled = req.body?.disabled;
  if (typeof disabled !== "boolean") throw new HttpError(400, '"disabled" must be true or false.');

  const target = await requireTarget(caller, targetUid);

  await adminAuth().updateUser(targetUid, { disabled });
  await adminDb().doc(`users/${targetUid}`).update({ disabled });
  if (disabled) await adminAuth().revokeRefreshTokens(targetUid);

  await writeAudit({
    by: caller.uid, byUsername: caller.username,
    action: "user.disable", entityId: targetUid,
    summary: `${disabled ? "Disabled" : "Re-enabled"} @${target.data.username}`,
    after: disabled,
  });

  return { ok: true };
});
