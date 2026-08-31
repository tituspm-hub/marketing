import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const KEYS = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID",
};

export function readFirebaseConfig(env) {
  const config = {};
  const missing = [];
  for (const [field, key] of Object.entries(KEYS)) {
    const value = env[key];
    if (!value) missing.push(key);
    else config[field] = value;
  }
  if (missing.length) {
    throw new Error(
      `Firebase config incomplete. Missing from .env.local: ${missing.join(", ")}. ` +
        `Copy .env.example and fill it from the Firebase console.`
    );
  }
  return config;
}

export const app = initializeApp(readFirebaseConfig(import.meta.env));
export const auth = getAuth(app);
export const db = getFirestore(app);

if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
