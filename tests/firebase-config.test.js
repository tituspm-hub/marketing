import { describe, it, expect } from "vitest";
import { readFirebaseConfig } from "../src/lib/firebase.js";

const complete = {
  VITE_FIREBASE_API_KEY: "k",
  VITE_FIREBASE_AUTH_DOMAIN: "d",
  VITE_FIREBASE_PROJECT_ID: "p",
  VITE_FIREBASE_STORAGE_BUCKET: "b",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "s",
  VITE_FIREBASE_APP_ID: "a",
};

describe("readFirebaseConfig", () => {
  it("maps env vars onto the SDK config shape", () => {
    expect(readFirebaseConfig(complete)).toEqual({
      apiKey: "k",
      authDomain: "d",
      projectId: "p",
      storageBucket: "b",
      messagingSenderId: "s",
      appId: "a",
    });
  });

  it("names every missing key in the error, not just the first", () => {
    const partial = { ...complete };
    delete partial.VITE_FIREBASE_API_KEY;
    delete partial.VITE_FIREBASE_APP_ID;
    expect(() => readFirebaseConfig(partial)).toThrow(
      /VITE_FIREBASE_API_KEY.*VITE_FIREBASE_APP_ID/s
    );
  });

  it("treats an empty string as missing", () => {
    expect(() => readFirebaseConfig({ ...complete, VITE_FIREBASE_APP_ID: "" }))
      .toThrow(/VITE_FIREBASE_APP_ID/);
  });
});
