import { adminDb } from "../_lib/admin";
import { handle, HttpError } from "../_lib/http";
import { requireCaller, writeAudit, passwordStamp } from "../_lib/guard";

export default handle(async (req) => {
  const caller = await requireCaller(req);

  const ref = adminDb().doc(`users/${caller.uid}`);
  const snap = await ref.get();
  // Any member may call this on themselves, so it must be idempotent: without the
  // guard a repeated call would append an audit entry every time.
  if (snap.data()?.mustChangePassword !== true) return { ok: true, unchanged: true };

  // The flag may only come down on evidence that the password actually moved. Without
  // this the endpoint is a one-request bypass of the forced change, leaving the admin
  // who issued the temporary password able to sign in as this teammate indefinitely.
  const passwordSetAt = snap.data()?.passwordSetAt;
  if (typeof passwordSetAt !== "string") {
    throw new HttpError(409, "Ask an admin to reset your password before changing it.");
  }
  const current = await passwordStamp(caller.uid);
  if (!(Date.parse(current) > Date.parse(passwordSetAt))) {
    throw new HttpError(403, "Set a new password before continuing.");
  }

  await ref.update({ mustChangePassword: false, passwordSetAt: current });

  await writeAudit({
    by: caller.uid, byUsername: caller.username,
    action: "user.passwordChanged", entityId: caller.uid,
    summary: `@${caller.username} set a new password`,
  });

  return { ok: true };
});
