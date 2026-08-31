import { adminAuth, adminDb } from "../_lib/admin";
import { handle, HttpError, requireString } from "../_lib/http";
import { requireCaller, requireTarget, writeAudit } from "../_lib/guard";
import { canAssignRoles } from "../../src/shared/roles.js";

export default handle(async (req) => {
  const caller = await requireCaller(req);
  if (!canAssignRoles(caller.role)) {
    throw new HttpError(403, "Only a super-admin can change roles.");
  }

  const targetUid = requireString(req.body, "uid", 128);
  const role = requireString(req.body, "role", 20);

  if (role === "superadmin") {
    throw new HttpError(403, "The super-admin list is fixed and cannot be extended.");
  }
  if (role !== "member" && role !== "admin") {
    throw new HttpError(400, "Role must be member or admin.");
  }

  const target = await requireTarget(caller, targetUid);
  if (target.role === role) return { ok: true, unchanged: true };

  await adminAuth().setCustomUserClaims(targetUid, { role });
  try {
    await adminDb().doc(`users/${targetUid}`).update({ role });
  } catch (err) {
    // firestore.rules grants admin writes off the claim, not the profile. A claim left
    // ahead of a failed profile write is a privilege the Team page would never show.
    await adminAuth().setCustomUserClaims(targetUid, { role: target.role }).catch(() => {});
    throw err;
  }
  // The new claim only reaches the client on the next token refresh; forcing one
  // means the change takes effect immediately rather than within the hour.
  await adminAuth().revokeRefreshTokens(targetUid);

  await writeAudit({
    by: caller.uid, byUsername: caller.username,
    action: "user.role", entityId: targetUid,
    summary: `Changed @${target.data.username} from ${target.role} to ${role}`,
    before: target.role, after: role,
  });

  return { ok: true };
});
