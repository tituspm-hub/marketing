import type { VercelRequest } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./admin";
import { HttpError } from "./http";
import { effectiveRole, canActOn } from "../../src/shared/roles.js";

export type Caller = { uid: string; username: string; role: string };

export async function requireCaller(req: VercelRequest): Promise<Caller> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Sign in to continue.");

  let decoded;
  try {
    // checkRevoked: a disabled or signed-out account is rejected immediately.
    decoded = await adminAuth().verifyIdToken(token, true);
  } catch {
    throw new HttpError(401, "Your session has expired. Sign in again.");
  }

  const snap = await adminDb().doc(`users/${decoded.uid}`).get();
  if (!snap.exists) throw new HttpError(403, "This account has no profile.");
  const data = snap.data()!;
  if (data.disabled === true) throw new HttpError(403, "This account is disabled.");

  return {
    uid: decoded.uid,
    username: String(data.username ?? ""),
    role: effectiveRole(decoded.uid, data.role),
  };
}

export async function requireTarget(caller: Caller, targetUid: string) {
  if (targetUid === caller.uid) {
    throw new HttpError(400, "You cannot perform this action on your own account.");
  }
  const snap = await adminDb().doc(`users/${targetUid}`).get();
  if (!snap.exists) throw new HttpError(404, "That teammate no longer exists.");
  const targetRole = effectiveRole(targetUid, snap.data()!.role);

  if (!canActOn({ actorUid: caller.uid, actorRole: caller.role, targetUid, targetRole })) {
    throw new HttpError(403, "You do not have permission to do that.");
  }
  return { uid: targetUid, role: targetRole, data: snap.data()! };
}

export async function writeAudit(entry: {
  by: string; byUsername: string; action: string;
  entityId: string; summary: string; before?: unknown; after?: unknown;
}) {
  await adminDb().collection("audit").add({ ...entry, at: FieldValue.serverTimestamp() });
}

// tokensValidAfterTime is optional in the Admin SDK types and Firestore rejects
// undefined, so fall back to now — the same instant the password was just set.
export async function passwordStamp(uid: string): Promise<string> {
  const user = await adminAuth().getUser(uid);
  return user.tokensValidAfterTime ?? new Date().toISOString();
}
