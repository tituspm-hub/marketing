import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let cached: App | undefined;

function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not set. Add the base64-encoded service-account " +
        "JSON in the Vercel dashboard under Settings > Environment Variables."
    );
  }
  const text = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(text);
}

export function adminApp(): App {
  if (!cached) {
    // Against the emulator the SDK authenticates through the host env vars, so
    // demanding a production service account would make local runs impossible.
    cached =
      getApps()[0] ??
      (process.env.FIRESTORE_EMULATOR_HOST
        ? initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-hire3x" })
        : initializeApp({ credential: cert(credentials()) }));
  }
  return cached;
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
