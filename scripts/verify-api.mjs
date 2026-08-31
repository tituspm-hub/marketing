// Drives the /api route handlers directly against the emulator suite. Node strips the
// TypeScript, so this needs no `vercel dev` and no Vercel account.
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.GCLOUD_PROJECT ??= "demo-hire3x";

// The /api routes use extensionless relative imports, which Vercel's bundler resolves
// but bare Node ESM does not. This lets the harness load the routes exactly as shipped.
const { registerHooks } = await import("node:module");
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try { return next(`${specifier}.ts`, context); } catch { /* fall through */ }
    }
    return next(specifier, context);
  },
});

const { initializeApp } = await import("firebase/app");
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import("firebase/auth");
const { toAuthEmail } = await import("../src/lib/username.js");
const { generateTempPassword } = await import("../src/lib/password.js");
const { adminAuth, adminDb } = await import("../api/_lib/admin.ts");

const routes = {
  create: (await import("../api/users/create.ts")).default,
  setRole: (await import("../api/users/set-role.ts")).default,
  setDisabled: (await import("../api/users/set-disabled.ts")).default,
  resetPassword: (await import("../api/users/reset-password.ts")).default,
  clearMustChange: (await import("../api/users/clear-must-change.ts")).default,
};

const client = initializeApp({
  apiKey: "demo-api-key", authDomain: "demo-hire3x.firebaseapp.com",
  projectId: "demo-hire3x", storageBucket: "demo-hire3x.appspot.com",
  messagingSenderId: "000000000000", appId: "1:000000000000:web:demo",
});
const clientAuth = getAuth(client);
connectAuthEmulator(clientAuth, "http://127.0.0.1:9099", { disableWarnings: true });

async function tokenFor(username, password) {
  const cred = await signInWithEmailAndPassword(clientAuth, toAuthEmail(username), password);
  return cred.user.getIdToken(true);
}

function res() {
  const r = {
    statusCode: null, body: null, writableEnded: false,
    status(c) { r.statusCode = c; return r; },
    json(b) { r.body = b; r.writableEnded = true; return r; },
  };
  return r;
}
async function call(route, token, body, method = "POST") {
  const r = res();
  await route({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, r);
  return r;
}

// Every run starts from a clean slate: the emulator keeps state for the life of the
// suite, and a leftover account from the previous run turns a 200 into a 409.
for (const u of (await adminAuth().listUsers(1000)).users) {
  if (u.email?.startsWith("qa")) {
    await adminAuth().deleteUser(u.uid);
    await adminDb().doc(`users/${u.uid}`).delete();
  }
}

let pass = 0, fail = 0;
async function expect(name, fn) {
  try { await fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (err) { console.log(`  FAIL  ${name}\n          ${err.message}`); fail++; }
}
function eq(actual, expected, what) {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const [callerName, callerPassword] = process.argv.slice(2);
if (!callerName || !callerPassword) {
  console.error("usage: node scripts/verify-api.mjs <super-admin username> <password>");
  process.exit(2);
}
const gebinToken = await tokenFor(callerName, callerPassword);
const callerUid = (await adminAuth().verifyIdToken(gebinToken)).uid;
const memberPassword = generateTempPassword();
const otherPassword = generateTempPassword();
let memberUid, otherUid;

console.log("\n--- guard ---");
await expect("no token is rejected with 401", async () => {
  eq((await call(routes.create, null, {})).statusCode, 401, "status");
});
await expect("a non-POST method is rejected with 405", async () => {
  eq((await call(routes.create, gebinToken, {}, "GET")).statusCode, 405, "status");
});
await expect("a forged token is rejected with 401", async () => {
  eq((await call(routes.create, "not.a.token", {})).statusCode, 401, "status");
});

console.log("\n--- create ---");
await expect("a super-admin creates a member", async () => {
  const r = await call(routes.create, gebinToken, {
    username: "qamember", displayName: "QA Member", tempPassword: memberPassword, role: "member",
  });
  eq(r.statusCode, 200, "status");
  eq(r.body.username, "qamember", "username");
  memberUid = r.body.uid;
});
await expect("the created profile holds no address and forces a password change", async () => {
  const snap = await adminDb().doc(`users/${memberUid}`).get();
  eq(snap.data().mustChangePassword, true, "mustChangePassword");
  eq(snap.data().role, "member", "role");
  if (JSON.stringify(snap.data()).includes("@")) throw new Error("profile leaks an address");
});
await expect("the temp password is never echoed back", async () => {
  const r = await call(routes.create, gebinToken, {
    username: "qaother", displayName: "QA Other", tempPassword: otherPassword, role: "member",
  });
  eq(r.statusCode, 200, "status");
  otherUid = r.body.uid;
  if (JSON.stringify(r.body).includes(otherPassword)) throw new Error("password echoed");
});
await expect("a duplicate username is refused with 409", async () => {
  const r = await call(routes.create, gebinToken, {
    username: "qamember", displayName: "Other", tempPassword: generateTempPassword(), role: "member",
  });
  eq(r.statusCode, 409, "status");
});
await expect("a weak password is refused with 400", async () => {
  const r = await call(routes.create, gebinToken, {
    username: "qanewbie", displayName: "New", tempPassword: "short1", role: "member",
  });
  eq(r.statusCode, 400, "status");
});
await expect("a reserved username is refused with 400", async () => {
  const r = await call(routes.create, gebinToken, {
    username: "admin", displayName: "Nope", tempPassword: generateTempPassword(), role: "member",
  });
  eq(r.statusCode, 400, "status");
});
await expect("creating a super-admin is refused with 403", async () => {
  const r = await call(routes.create, gebinToken, {
    username: "qasneaky", displayName: "Sneaky", tempPassword: generateTempPassword(), role: "superadmin",
  });
  eq(r.statusCode, 403, "status");
});
await expect("a failed create leaves no account holding the username", async () => {
  const list = await adminAuth().listUsers(100);
  const stranded = list.users.filter((u) => ["qasneaky", "qanewbie"].includes(u.email?.split("@")[0]));
  eq(stranded.length, 0, "stranded accounts");
});

console.log("\n--- set-role ---");
await expect("a super-admin promotes a member to admin", async () => {
  eq((await call(routes.setRole, gebinToken, { uid: memberUid, role: "admin" })).statusCode, 200, "status");
  eq((await adminDb().doc(`users/${memberUid}`).get()).data().role, "admin", "stored role");
  eq((await adminAuth().getUser(memberUid)).customClaims.role, "admin", "claim");
});
await expect("the claim and the profile agree after the change", async () => {
  const claim = (await adminAuth().getUser(memberUid)).customClaims.role;
  const stored = (await adminDb().doc(`users/${memberUid}`).get()).data().role;
  eq(claim, stored, "claim vs profile");
});
await expect("acting on a super-admin is refused with 403", async () => {
  eq((await call(routes.setRole, gebinToken, { uid: "sa_yash", role: "member" })).statusCode, 403, "status");
});
await expect("acting on yourself is refused with 400", async () => {
  eq((await call(routes.setRole, gebinToken, { uid: callerUid, role: "member" })).statusCode, 400, "status");
});
await expect("promoting to superadmin is refused with 403", async () => {
  eq((await call(routes.setRole, gebinToken, { uid: otherUid, role: "superadmin" })).statusCode, 403, "status");
});

console.log("\n--- an admin has fewer powers than a super-admin ---");
const memberToken = await tokenFor("qamember", memberPassword);
await expect("an admin may create a member", async () => {
  const r = await call(routes.create, memberToken, {
    username: "qahelper", displayName: "Helper", tempPassword: generateTempPassword(), role: "member",
  });
  eq(r.statusCode, 200, "status");
});
await expect("an admin may not create another admin", async () => {
  const r = await call(routes.create, memberToken, {
    username: "qahelper2", displayName: "Helper Two", tempPassword: generateTempPassword(), role: "admin",
  });
  eq(r.statusCode, 403, "status");
});
await expect("an admin may not change roles at all", async () => {
  eq((await call(routes.setRole, memberToken, { uid: otherUid, role: "admin" })).statusCode, 403, "status");
});
await expect("an admin may not act on a super-admin", async () => {
  eq((await call(routes.setDisabled, memberToken, { uid: "sa_titus", disabled: true })).statusCode, 403, "status");
});

console.log("\n--- disable and reset ---");
await expect("a super-admin disables a member", async () => {
  eq((await call(routes.setDisabled, gebinToken, { uid: otherUid, disabled: true })).statusCode, 200, "status");
  eq((await adminAuth().getUser(otherUid)).disabled, true, "auth disabled");
  eq((await adminDb().doc(`users/${otherUid}`).get()).data().disabled, true, "profile disabled");
});
await expect("a disabled teammate cannot sign in", async () => {
  try { await tokenFor("qaother", otherPassword); }
  catch { return; }
  throw new Error("a disabled account signed in");
});
await expect("a non-boolean disabled flag is refused with 400", async () => {
  eq((await call(routes.setDisabled, gebinToken, { uid: otherUid, disabled: "yes" })).statusCode, 400, "status");
});
await expect("re-enabling restores sign-in", async () => {
  eq((await call(routes.setDisabled, gebinToken, { uid: otherUid, disabled: false })).statusCode, 200, "status");
  await tokenFor("qaother", otherPassword);
});
await expect("a password reset re-raises the change prompt", async () => {
  const fresh = generateTempPassword();
  eq((await call(routes.resetPassword, gebinToken, { uid: otherUid, tempPassword: fresh })).statusCode, 200, "status");
  eq((await adminDb().doc(`users/${otherUid}`).get()).data().mustChangePassword, true, "mustChangePassword");
  await tokenFor("qaother", fresh);
});

console.log("\n--- clear-must-change ---");
await expect("the caller clears their own prompt", async () => {
  // Set the precondition here rather than relying on bootstrap state, which an
  // earlier run of this harness has already consumed.
  await adminDb().doc(`users/${callerUid}`).update({ mustChangePassword: true });
  const r = await call(routes.clearMustChange, gebinToken, {});
  eq(r.statusCode, 200, "status");
  eq((await adminDb().doc(`users/${callerUid}`).get()).data().mustChangePassword, false, "cleared");
});
await expect("a repeat call is idempotent and writes no second audit entry", async () => {
  const before = (await adminDb().collection("audit").get()).size;
  const r = await call(routes.clearMustChange, gebinToken, {});
  eq(r.body.unchanged, true, "unchanged");
  eq((await adminDb().collection("audit").get()).size, before, "audit entries");
});

console.log("\n--- audit trail ---");
await expect("every privileged action was recorded", async () => {
  const snap = await adminDb().collection("audit").get();
  const actions = new Set(snap.docs.map((d) => d.data().action));
  for (const a of ["user.create", "user.role", "user.disable", "user.passwordReset", "user.passwordChanged"]) {
    if (!actions.has(a)) throw new Error(`no audit entry for ${a}`);
  }
  for (const d of snap.docs) {
    if (!d.data().by || !d.data().at) throw new Error("an audit entry has no author or time");
  }
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
