import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { toAuthEmail, validateUsername } from "../src/lib/username.js";
import { generateTempPassword } from "../src/lib/password.js";
import { SUPER_ADMIN_UIDS } from "../src/shared/roles.js";

const SUPER_ADMINS = [
  { uid: "sa_yash", username: "yash", displayName: "Yash" },
  { uid: "sa_titus", username: "titus", displayName: "Titus" },
  { uid: "sa_gebin", username: "gebin", displayName: "Gebin" },
];

// Fail before touching anything if the script and the registry disagree.
const declared = SUPER_ADMINS.map((p) => p.uid);
if (JSON.stringify(declared) !== JSON.stringify([...SUPER_ADMIN_UIDS])) {
  throw new Error(
    `bootstrap UIDs ${declared.join(",")} do not match SUPER_ADMIN_UIDS ` +
      `${[...SUPER_ADMIN_UIDS].join(",")}`
  );
}

const DEFAULT_CATEGORIES = [
  { id: "meta", label: "Meta Ads", color: "sky", recurring: true },
  { id: "google", label: "Google Ads", color: "peach", recurring: true },
  { id: "influencer", label: "Influencer", color: "blush", recurring: false },
  { id: "agency", label: "Freelancer & Agency", color: "lilac", recurring: false },
  { id: "content", label: "Content Production", color: "mint", recurring: false },
  { id: "tools", label: "Tools & Software", color: "cream", recurring: true },
  { id: "events", label: "Events & Campus", color: "peach", recurring: false },
  { id: "other", label: "Other", color: "sky", recurring: false },
];

// Re-running is meant to repair claims and profiles. Resetting a live super-admin's
// password is not repair, so it takes an explicit flag.
const resetPasswords = process.argv.includes("--reset-passwords");

// Against the emulator the SDK needs only a project id; the host env vars do the rest.
const onEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
initializeApp(
  onEmulator
    ? { projectId: process.env.GCLOUD_PROJECT ?? "demo-hire3x" }
    : { credential: cert(JSON.parse(readFileSync("serviceAccount.json", "utf8"))) }
);
console.log(onEmulator ? "Running against the EMULATOR" : "Running against PRODUCTION");

const auth = getAuth();
const db = getFirestore();
const results = [];

for (const person of SUPER_ADMINS) {
  const check = validateUsername(person.username);
  if (!check.ok) throw new Error(`${person.username}: ${check.reason}`);

  const email = toAuthEmail(person.username);
  let tempPassword = generateTempPassword();
  let isNew = true;

  try {
    await auth.createUser({
      uid: person.uid,
      email,
      password: tempPassword,
      displayName: person.displayName,
    });
  } catch (err) {
    if (err.code !== "auth/uid-already-exists" && err.code !== "auth/email-already-exists") {
      throw err;
    }
    isNew = false;
    if (resetPasswords) {
      await auth.updateUser(person.uid, { password: tempPassword });
      console.log(`  (existing account for @${person.username} reused; password reset)`);
    } else {
      tempPassword = null;
      console.log(`  (existing account for @${person.username} left signed-in; claims repaired)`);
    }
  }

  await auth.setCustomUserClaims(person.uid, { role: "superadmin" });

  const profile = {
    username: person.username,
    displayName: person.displayName,
    role: "superadmin",
    disabled: false,
  };
  // createdAt and mustChangePassword belong to the account's first life only; a repair
  // run that rewrote them would relock three working accounts.
  if (isNew || resetPasswords) profile.mustChangePassword = true;
  if (isNew) {
    profile.createdAt = FieldValue.serverTimestamp();
    profile.createdBy = "bootstrap";
    profile.lastLoginAt = null;
  }
  await db.doc(`users/${person.uid}`).set(profile, { merge: true });

  results.push({ ...person, tempPassword });
}

const settings = db.doc("settings/app");
if (!(await settings.get()).exists) {
  await settings.set({
    periodStart: "2026-08",
    periodEnd: "2027-01",
    categories: DEFAULT_CATEGORIES,
    currency: "INR",
    updatedBy: "bootstrap",
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log("Seeded /settings/app");
}

console.log("\n=== Super-admin accounts ===");
for (const r of results) {
  const secret = r.tempPassword ? `temp password: ${r.tempPassword}` : "password unchanged";
  console.log(`  @${r.username.padEnd(8)} uid=${r.uid.padEnd(10)} ${secret}`);
}
console.log("\nNew accounts must change their password on first sign-in.");
console.log("Re-run with --reset-passwords to issue fresh temporary passwords.\n");
process.exit(0);
