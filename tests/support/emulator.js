// Shared setup for the suites that run against the live emulators. They used to rely
// on whatever the last bootstrap run left behind, so a password reset elsewhere made
// them fail for reasons that had nothing to do with the code under test.
export const TEST_PASSWORD = "Emulator-test-1";

export async function emulatorReachable() {
  try {
    return (await fetch("http://127.0.0.1:9099", { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

export async function adminApp() {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.GCLOUD_PROJECT ??= "demo-hire3x";
  const { initializeApp, getApps } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (!getApps().length) initializeApp({ projectId: "demo-hire3x" });
  return { auth: getAuth(), db: getFirestore() };
}

// Puts one account into a known state. Suites take different accounts on purpose:
// vitest runs files in parallel, and two suites seeding the same uid with different
// mustChangePassword values race each other.
export async function seedOwner({ uid = "sa_gebin", mustChangePassword }) {
  const { auth, db } = await adminApp();
  await auth.updateUser(uid, { password: TEST_PASSWORD });
  const stamp = (await auth.getUser(uid)).tokensValidAfterTime ?? new Date().toISOString();
  await db.doc(`users/${uid}`).set({ mustChangePassword, passwordSetAt: stamp }, { merge: true });
  return { auth, db };
}
