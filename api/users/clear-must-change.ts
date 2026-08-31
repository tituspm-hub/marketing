import { adminDb } from "../_lib/admin";
import { handle } from "../_lib/http";
import { requireCaller, writeAudit } from "../_lib/guard";

export default handle(async (req) => {
  const caller = await requireCaller(req);

  const ref = adminDb().doc(`users/${caller.uid}`);
  const snap = await ref.get();
  // Any member may call this on themselves, so it must be idempotent: without the
  // guard a repeated call would append an audit entry every time.
  if (snap.data()?.mustChangePassword !== true) return { ok: true, unchanged: true };

  await ref.update({ mustChangePassword: false });

  await writeAudit({
    by: caller.uid, byUsername: caller.username,
    action: "user.passwordChanged", entityId: caller.uid,
    summary: `@${caller.username} set a new password`,
  });

  return { ok: true };
});
