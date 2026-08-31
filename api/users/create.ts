import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../_lib/admin";
import { handle, HttpError, requireString } from "../_lib/http";
import { requireCaller, writeAudit, passwordStamp } from "../_lib/guard";
import { validateUsername, toAuthEmail } from "../../src/lib/username.js";
import { validatePassword } from "../../src/lib/password.js";
import { canManageUsers, canAssignRoles } from "../../src/shared/roles.js";

export default handle(async (req) => {
  const caller = await requireCaller(req);
  if (!canManageUsers(caller.role)) {
    throw new HttpError(403, "Only admins can add teammates.");
  }

  const username = requireString(req.body, "username", 20).toLowerCase();
  const displayName = requireString(req.body, "displayName", 60);
  const tempPassword = requireString(req.body, "tempPassword", 128);
  const role = (req.body?.role ?? "member") as string;

  const nameCheck = validateUsername(username);
  if (!nameCheck.ok) throw new HttpError(400, nameCheck.reason);

  const pwCheck = validatePassword(tempPassword);
  if (!pwCheck.ok) throw new HttpError(400, pwCheck.reason);

  if (role === "superadmin") {
    throw new HttpError(403, "Super-admins cannot be created. That list is fixed.");
  }
  if (role !== "member" && role !== "admin") {
    throw new HttpError(400, "Role must be member or admin.");
  }
  if (role === "admin" && !canAssignRoles(caller.role)) {
    throw new HttpError(403, "Only a super-admin can create another admin.");
  }

  let created;
  try {
    created = await adminAuth().createUser({
      email: toAuthEmail(username),
      password: tempPassword,
      displayName,
    });
  } catch (err: any) {
    if (err?.code === "auth/email-already-exists") {
      throw new HttpError(409, `The username "${username}" is already taken.`);
    }
    throw err;
  }

  try {
    await adminAuth().setCustomUserClaims(created.uid, { role });

    // The Auth stamp at the moment the admin set this password. clear-must-change
    // refuses to lower the flag until it has moved, which only the account holder
    // changing their own password can do.
    const passwordSetAt = await passwordStamp(created.uid);

    await adminDb().doc(`users/${created.uid}`).set({
      username,
      displayName,
      role,
      mustChangePassword: true,
      passwordSetAt,
      disabled: false,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.uid,
      lastLoginAt: null,
    });
  } catch (err) {
    // Without the profile the account can never sign in and never appears on the Team
    // page, yet it would hold the username forever. Undo it rather than strand it.
    await adminAuth().deleteUser(created.uid).catch(() => {});
    throw err;
  }

  await writeAudit({
    by: caller.uid,
    byUsername: caller.username,
    action: "user.create",
    entityId: created.uid,
    summary: `Created @${username} as ${role}`,
  });

  // The temp password is never persisted and never echoed back; the caller typed it.
  return { uid: created.uid, username };
});
