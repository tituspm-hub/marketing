# Hire3x Marketing Budget Tracker

Team budget tracking for five people. Sign-in is by **username** — never an email
address. Firebase Auth backs each username with a synthetic address behind the scenes,
so nothing in the interface ever shows an `@`.

Everything below runs locally against the Firebase Emulator Suite. No Firebase account,
no service-account key, and no deployment are needed to develop or verify the app.

## Prerequisites

- Node 22 or newer (Node 26 is what this was verified on)
- Java on your `PATH` — the Firestore emulator runs on the JVM

  ```bash
  brew install openjdk
  export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
  ```

  Without it every emulator command fails with *Unable to locate a Java Runtime*.

## Local setup

```bash
npm install
npm run emulators          # terminal 1 — Auth on 9099, Firestore on 8080, UI on 4000
npm run bootstrap:emulator # terminal 2 — seeds the three super-admins, prints passwords
npm run dev                # terminal 2 — the app on 5173
```

`bootstrap:emulator` runs once per environment. Re-running it repairs custom claims and
profile documents but leaves existing passwords alone; pass `--reset-passwords` to issue
fresh temporary ones.

The emulators keep state only while they are running, so re-seed after a restart.

### Environment

`.env.local` holds the browser's Firebase config and already points at the emulators
(`VITE_USE_EMULATORS=true`). `.env` points the backend Admin SDK at the same emulators so
`vercel dev` needs no service account. Neither file is committed; `.env.example` lists the
keys. In production `FIREBASE_SERVICE_ACCOUNT` is set in the Vercel dashboard.

## Verification

```bash
npm test                # unit suite
npm run test:rules      # security rules, in a throwaway emulator
npx tsc --noEmit        # backend types
npm run build           # production bundle
```

`npm run test:rules` starts its own emulator, so it fails with *port taken* while
`npm run emulators` is running. With the emulators already up, attach to them instead:

```bash
npm run test:rules:attach
```

It uses a separate project id, so it never touches your development data.

### End-to-end checks against the running emulators

Both take a super-admin's current password, printed by the bootstrap:

```bash
npm run verify:local -- gebin <password>   # client SDK: login, claims, security rules
npm run verify:api   -- gebin <password>   # the /api routes: permissions and audit trail
```

`verify:local` drives the browser SDK: the username-to-address mapping, the super-admin
claim, and every expense rule. `verify:api` drives the Vercel functions directly under
Node, covering the permission matrix — who may create, promote, disable and reset whom —
and the audit entries each action writes. It deletes and recreates its own `qa*` accounts,
so it is safe to re-run.

## Architecture

- **Auth** — usernames mapped to `<username>@team.hire3x.com`. Password reset is done by
  a super-admin from the Team page; there is no self-service reset.
- **Roles** — `superadmin`, `admin`, `member`. The three super-admins are fixed UIDs
  listed in `src/shared/roles.js` and mirrored in `firestore.rules`; a test fails if the
  two lists drift. The list cannot be extended at runtime.
- **Data** — one Firestore document per expense, so concurrent edits never clobber
  each other.
- **Privileged writes** — no client may write `/users`. Creating, promoting, disabling
  and password-resetting all run in Vercel Serverless Functions under the Admin SDK.
- **Hosting** — Vercel. Firebase stays on the free Spark plan (Auth and Firestore only).
