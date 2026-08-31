# Foundation & Access — Implementation Plan (1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed, access-controlled shell of the marketing budget tracker where five named people sign in with a username and password, and admins onboard teammates from a Team page.

**Architecture:** Firebase Auth backs usernames by appending a fixed synthetic domain before every SDK call. All privileged operations (creating users, changing roles, disabling accounts) run in Vercel Serverless Functions under the Firebase Admin SDK; no client may write `/users`. Two super-admin UIDs live in `src/shared/roles.js`, imported by both the browser bundle and the backend so the two copies cannot drift, and repeated in `firestore.rules`. Firestore security rules are written and tested before any UI consumes them.

**Tech Stack:** React 18.3, Vite 6, Tailwind CSS v4, React Router 6, Firebase JS SDK v11 (Auth + Firestore only), Vercel Serverless Functions (Node 20, TypeScript), `firebase-admin`, Vitest, Testing Library, `@firebase/rules-unit-testing`, Firebase Emulator Suite.

**Spec:** `docs/superpowers/specs/2026-08-31-firebase-migration-design.md`

## Global Constraints

- Branch is `gebin-Dev`. Never commit or push to `main`. Verify with `git branch --show-current` before every commit.
- `USERNAME_DOMAIN = "team.hire3x.com"` — defined once in `src/lib/username.js` and imported by both the browser bundle and the `/api` backend. Never re-declare it.
- Usernames: lowercase `a-z0-9._-`, 3–20 characters, must begin with a letter. Reserved and rejected: `admin`, `root`, `system`, `support`, `api`, `null`, `firebase`.
- The UI never renders an `@` or an email address for a login identity. Labels say "Username".
- Roles are exactly `superadmin`, `admin`, `member`. `superadmin` is assignable only by `scripts/bootstrap.mjs` — no API route may set it.
- Currency is INR. All money is rendered with `Intl.NumberFormat("en-IN")` and tabular numerals.
- No source file exceeds 250 lines. Split rather than exceed.
- Everything runs on free tiers: Firebase **Spark** (Auth + Firestore only) and Vercel **Hobby**. No payment method anywhere. Do not enable Cloud Functions or Cloud Storage.
- Public config lives in `.env.local` (git-ignored). The service-account JSON is the one real secret: it lives only in the Vercel environment variable `FIREBASE_SERVICE_ACCOUNT` and is never committed.
- Every task ends with a passing test run and a commit.

---

## File Structure

**Created by this plan:**

| Path | Responsibility |
| --- | --- |
| `.env.local` / `.env.example` | Firebase web config; only the example is committed |
| `firebase.json` | Emulator ports and rules wiring |
| `vercel.json` | Build output and SPA rewrites |
| `firestore.rules` | Authorisation; the last line of defence |
| `firestore.indexes.json` | Single-field index declarations |
| `src/lib/firebase.js` | SDK initialisation; exports `auth` and `db` |
| `src/lib/api.js` | Authenticated `fetch` wrapper that attaches the ID token |
| `src/shared/roles.js` | Super-admin registry and guards; imported by client **and** `/api` |
| `src/lib/format.js` | `inr`, `fmtDate`, `escapeHtml`, `parseAmount` — pure |
| `src/lib/period.js` | Month derivation from settings — pure |
| `src/lib/username.js` | Username validation and synthetic-email mapping — pure |
| `src/auth/AuthProvider.jsx` | Session, profile document, role; exposes `useAuth()` |
| `src/auth/RequireAuth.jsx` | Route guard; enforces the forced password change |
| `src/auth/LoginPage.jsx` | Username + password form |
| `src/auth/ChangePasswordPage.jsx` | Forced and voluntary password change |
| `src/App.jsx` | Router and application shell only |
| `src/components/AppShell.jsx` | Header, navigation, account menu |
| `src/features/admin/TeamPage.jsx` | User list and administration actions |
| `src/features/admin/AddTeammateDialog.jsx` | Create-user form and handover message |
| `api/_lib/admin.ts` | Admin SDK initialisation from `FIREBASE_SERVICE_ACCOUNT` |
| `api/_lib/guard.ts` | ID-token verification, caller loading, role guards, audit writes |
| `api/users/create.ts` | Create a teammate |
| `api/users/reset-password.ts` | Issue a new temporary password |
| `api/users/set-role.ts` | Promote or demote |
| `api/users/set-disabled.ts` | Disable or re-enable |
| `api/users/clear-must-change.ts` | Clear the forced-password-change flag |
| `scripts/bootstrap.mjs` | One-time super-admin creation |
| `tests/` | Unit suites mirroring `src/lib` |
| `tests/rules/` | Emulator-backed security-rules suites |

**Modified:** `package.json`, `vite.config.js`, `src/main.jsx`, `.gitignore`, `README.md`.

**Deferred to Plan 2:** `src/data/*`, dashboard, expense list, budget panel, Settings page.

## Spec failure-point coverage

Spec §10 lists ten defects in the current implementation. This plan closes seven. The
remaining three are listed here so they cannot be lost at a plan boundary.

| # | Defect | Closed by |
| --- | --- | --- |
| 1 | Unguarded `MONTHS.find(...).full` | Task 4 — `findMonth` never returns undefined |
| 2 | Hardcoded date clamp in `todayISO()` | Task 4 — period read from `/settings/app` |
| 3 | Whole-state blob writes clobber concurrent editors | Task 6 — per-document rules; the write path itself is Plan 2 |
| 4 | Fire-and-forget `persist()` | **Plan 2** — data hooks with surfaced save state |
| 5 | `escapeHtml` misses `'` and backtick | Task 3 |
| 6 | `"exp_" + Date.now()` id collisions | **Plan 2** — `crypto.randomUUID()` on create |
| 7 | Delete with no confirmation or recovery | **Plan 3** — undo toast |
| 8 | Unvalidated numeric amounts | Task 3 (`parseAmount`) and Task 6 (rules) |
| 9 | No authentication | Tasks 6–17 |
| 10 | Zero test coverage | Task 1, then every task after it |

---

### Task 1: Test harness and dependencies

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Create: `tests/smoke.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs Vitest in `node` environment across `tests/**/*.test.{js,jsx}`; `npm run test:rules` is reserved for Task 6.

- [ ] **Step 1: Install dependencies**

```bash
npm install firebase react-router-dom
npm install firebase-admin
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @firebase/rules-unit-testing firebase-tools @vercel/node typescript @types/node
```

- [ ] **Step 2: Add Vitest configuration to `vite.config.js`**

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.{js,jsx}"],
    exclude: ["tests/rules/**"],
  },
});
```

- [ ] **Step 3: Create `tests/setup.js`**

```js
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add scripts to `package.json`**

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "emulators": "firebase emulators:start --only auth,firestore",
  "test:rules": "firebase emulators:exec --only firestore \"vitest run --config vitest.rules.config.js\""
}
```

- [ ] **Step 5: Write the smoke test**

```js
// tests/smoke.test.js
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
  it("has jsdom available", () => {
    expect(typeof document).toBe("object");
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, 2 tests.

- [ ] **Step 7: Ignore secrets**

Append to `.gitignore`:

```
node_modules
dist
.env.local
.env*.local
*serviceAccount*.json
.firebase/
firebase-debug.log
.vercel/
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vite.config.js tests/ .gitignore
git commit -m "chore: add Vitest harness and Firebase dependencies"
```

---

### Task 2: Firebase project, Vercel project, and SDK wiring

**Files:**
- Create: `.env.example`
- Create: `.env.local` (not committed)
- Create: `src/lib/firebase.js`
- Create: `tests/firebase-config.test.js`
- Create: `firebase.json`
- Create: `.firebaserc`
- Create: `vercel.json`
- Create: `firestore.indexes.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `readFirebaseConfig(env)` → config object, throws on missing keys. Module exports `app`, `auth`, `db`.

- [ ] **Step 1: Human setup — create the Firebase project**

This step is performed by the user in a browser. Do not attempt to automate it.

1. Go to `console.firebase.google.com` and click **Add project**. Name it `hire3x-marketing-tracker`. Google Analytics is not needed; decline it.
2. In the left rail, open **Build → Authentication → Get started**. Select **Email/Password**, enable the first toggle only (leave "Email link" off), and save.
3. Open **Build → Firestore Database → Create database**. Choose **Production mode**. Pick region `asia-south1` (Mumbai).
4. **Stay on the Spark plan.** Do not upgrade, and do not enable Storage or Functions. Nothing in this project needs them.
5. Open **Project settings** (gear icon) **→ General → Your apps → Web (`</>`)**. Register an app named `tracker`. Leave the Firebase Hosting checkbox **unticked** — hosting is Vercel's job.
6. Copy the `firebaseConfig` object shown.

- [ ] **Step 2: Record the config**

Create `.env.local` from the copied values:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_USE_EMULATORS=false
```

Then link the Vercel project: run `npx vercel link` in the repo and follow the prompts.
Add the same six `VITE_FIREBASE_*` values in the Vercel dashboard under
**Settings → Environment Variables**, scoped to all environments. Vite inlines them at
build time, so a value added after a deployment needs a redeploy to take effect.

Commit `.env.example` with the same keys and empty values.

Note: a Firebase web API key is not a secret — it identifies the project, and security rules do the actual protection. It lives in `.env.local` for configuration hygiene, not confidentiality.

- [ ] **Step 3: Write the failing test**

```js
// tests/firebase-config.test.js
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
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `npm test -- firebase-config`
Expected: FAIL — `src/lib/firebase.js` does not exist.

- [ ] **Step 5: Implement `src/lib/firebase.js`**

```js
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
```

Because the test imports this module, `import.meta.env` must be populated during tests. Vitest provides it from `.env.local`; if the file is absent in CI the module-level `initializeApp` throws. To keep the pure function testable in isolation, the test above imports only `readFirebaseConfig` — verify it passes, and if module-level initialisation interferes, move `readFirebaseConfig` to `src/lib/firebaseConfig.js` and import it from both places.

- [ ] **Step 6: Run the test**

Run: `npm test -- firebase-config`
Expected: PASS, 3 tests.

- [ ] **Step 7: Create `firebase.json` and `.firebaserc`**

Firebase provides only Auth, Firestore, and the local emulators. There is no hosting
block and no functions block.

```json
{
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

`.firebaserc` — substitute the real project id:

```json
{ "projects": { "default": "hire3x-marketing-tracker" } }
```

- [ ] **Step 8: Create `vercel.json`**

The rewrite must exclude `/api`. Without the negative lookahead every backend request is
swallowed by the SPA fallback and returns `index.html` with status 200 — which surfaces
as a confusing JSON parse error rather than an obvious routing bug.

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

- [ ] **Step 9: Create `firestore.indexes.json`**

The dashboard query is `where("month", "==", ...)` with `orderBy("date")`, which Firestore
serves from automatic single-field indexes. No composite index is needed; the file exists
so `firebase deploy --only firestore` has something to read.

```json
{ "indexes": [], "fieldOverrides": [] }
```

- [ ] **Step 10: Commit**

```bash
git add .env.example firebase.json .firebaserc vercel.json firestore.indexes.json src/lib/firebase.js tests/firebase-config.test.js
git commit -m "feat: wire the Firebase SDK, emulators, and Vercel project"
```

---

### Task 3: Money, date, and escaping primitives

Fixes spec failure points #5 (incomplete HTML escaping) and #8 (unvalidated numeric input).

**Files:**
- Create: `src/lib/format.js`
- Create: `tests/format.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `inr(value: number | null | undefined) => string`
  - `fmtDate(iso: string) => string`
  - `escapeHtml(value: unknown) => string`
  - `parseAmount(input: string | number) => number | null`

- [ ] **Step 1: Write the failing test**

```js
// tests/format.test.js
import { describe, it, expect } from "vitest";
import { inr, fmtDate, escapeHtml, parseAmount } from "../src/lib/format.js";

describe("inr", () => {
  it("uses Indian digit grouping and drops decimals", () => {
    expect(inr(2500000)).toBe("₹25,00,000");
    expect(inr(1000)).toBe("₹1,000");
  });
  it("renders every non-finite input as zero rather than NaN", () => {
    for (const bad of [null, undefined, NaN, Infinity, -Infinity, "abc"]) {
      expect(inr(bad)).toBe("₹0");
    }
  });
});

describe("fmtDate", () => {
  it("formats an ISO date as day and short month", () => {
    expect(fmtDate("2026-08-12")).toBe("12 Aug");
  });
  it("returns an em dash for empty or unparseable input", () => {
    expect(fmtDate("")).toBe("—");
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("not-a-date")).toBe("—");
    expect(fmtDate("2026-13-45")).toBe("—");
  });
});

describe("escapeHtml", () => {
  it("escapes every character that can break out of markup or an attribute", () => {
    expect(escapeHtml(`<b>"x" 'y' & \`z\``)).toBe(
      "&lt;b&gt;&quot;x&quot; &#39;y&#39; &amp; &#96;z&#96;"
    );
  });
  it("escapes the ampersand first so entities are not double-broken", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
  it("coerces non-strings without throwing", () => {
    expect(escapeHtml(null)).toBe("null");
    expect(escapeHtml(42)).toBe("42");
  });
});

describe("parseAmount", () => {
  it("accepts plain, grouped, and symbol-prefixed numbers", () => {
    expect(parseAmount("25000")).toBe(25000);
    expect(parseAmount("25,000")).toBe(25000);
    expect(parseAmount("₹25,000")).toBe(25000);
    expect(parseAmount(25000)).toBe(25000);
  });
  it("expands Indian shorthand suffixes", () => {
    expect(parseAmount("25k")).toBe(25000);
    expect(parseAmount("1.2L")).toBe(120000);
    expect(parseAmount("1.5cr")).toBe(15000000);
  });
  it("rejects anything that is not a positive finite number", () => {
    for (const bad of ["", "abc", "-5", "0", "Infinity", "1e400", null, undefined, {}]) {
      expect(parseAmount(bad)).toBeNull();
    }
  });
  it("rejects amounts above the ten crore ceiling", () => {
    expect(parseAmount("100000001")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- format`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/format.js`**

```js
export const MAX_AMOUNT = 100_000_000; // ten crore; also enforced in firestore.rules

const inrFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function inr(value) {
  const n = Number(value);
  return "₹" + inrFormatter.format(Number.isFinite(n) ? n : 0);
}

export function fmtDate(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  // Reject values the Date constructor silently rolls over, e.g. 2026-13-45.
  if (d.toISOString().slice(0, 10) !== iso) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"'`]/g, (c) => ENTITIES[c]);
}

const SUFFIXES = { k: 1_000, l: 100_000, lakh: 100_000, cr: 10_000_000, crore: 10_000_000 };

export function parseAmount(input) {
  if (typeof input === "number") return finitePositive(input);
  if (typeof input !== "string") return null;
  const cleaned = input.trim().toLowerCase().replace(/[₹,\s]/g, "");
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(k|l|lakh|cr|crore)?$/);
  if (!match) return null;
  const base = Number(match[1]);
  const multiplier = match[2] ? SUFFIXES[match[2]] : 1;
  return finitePositive(base * multiplier);
}

function finitePositive(n) {
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) return null;
  return Math.round(n);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- format`
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.js tests/format.test.js
git commit -m "feat: add money, date, and HTML-escaping primitives"
```

---

### Task 4: Period derivation

Fixes spec failure points #1 (unguarded month lookup) and #2 (hardcoded date clamp).

**Files:**
- Create: `src/lib/period.js`
- Create: `tests/period.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `monthKey(isoDate: string) => string | null`
  - `monthsInPeriod(start: string, end: string) => Array<{ key, label, full }>`
  - `findMonth(months, key) => { key, label, full }` — never returns `undefined`
  - `isWithinPeriod(isoDate, start, end) => boolean`
  - `defaultDateFor(start, end, now = new Date()) => string`

- [ ] **Step 1: Write the failing test**

```js
// tests/period.test.js
import { describe, it, expect } from "vitest";
import {
  monthKey, monthsInPeriod, findMonth, isWithinPeriod, defaultDateFor,
} from "../src/lib/period.js";

describe("monthKey", () => {
  it("takes the year and month from an ISO date", () => {
    expect(monthKey("2026-08-12")).toBe("2026-08");
  });
  it("returns null for malformed input instead of a broken slice", () => {
    expect(monthKey("")).toBeNull();
    expect(monthKey("12/08/2026")).toBeNull();
    expect(monthKey(null)).toBeNull();
  });
});

describe("monthsInPeriod", () => {
  it("enumerates inclusive months across a year boundary", () => {
    const months = monthsInPeriod("2026-08", "2027-01");
    expect(months).toHaveLength(6);
    expect(months[0]).toEqual({ key: "2026-08", label: "Aug", full: "August 2026" });
    expect(months[5]).toEqual({ key: "2027-01", label: "Jan", full: "January 2027" });
  });
  it("returns a single month when start equals end", () => {
    expect(monthsInPeriod("2026-08", "2026-08")).toHaveLength(1);
  });
  it("returns empty for an inverted or malformed period rather than looping forever", () => {
    expect(monthsInPeriod("2027-01", "2026-08")).toEqual([]);
    expect(monthsInPeriod("nonsense", "2027-01")).toEqual([]);
    expect(monthsInPeriod(undefined, undefined)).toEqual([]);
  });
  it("caps the period at 120 months so bad settings cannot hang the app", () => {
    expect(monthsInPeriod("2000-01", "2099-12")).toHaveLength(120);
  });
});

describe("findMonth", () => {
  const months = monthsInPeriod("2026-08", "2027-01");
  it("finds a month inside the period", () => {
    expect(findMonth(months, "2026-09").full).toBe("September 2026");
  });
  it("returns a usable fallback instead of undefined for an unknown key", () => {
    const fallback = findMonth(months, "2030-05");
    expect(fallback).toBeDefined();
    expect(fallback.key).toBe("2030-05");
    expect(typeof fallback.full).toBe("string");
  });
  it("survives an empty month list", () => {
    expect(findMonth([], "2026-08").key).toBe("2026-08");
  });
});

describe("isWithinPeriod", () => {
  it("includes both boundaries", () => {
    expect(isWithinPeriod("2026-08-01", "2026-08", "2027-01")).toBe(true);
    expect(isWithinPeriod("2027-01-31", "2026-08", "2027-01")).toBe(true);
  });
  it("excludes dates outside the period", () => {
    expect(isWithinPeriod("2026-07-31", "2026-08", "2027-01")).toBe(false);
    expect(isWithinPeriod("2027-02-01", "2026-08", "2027-01")).toBe(false);
  });
  it("rejects malformed dates", () => {
    expect(isWithinPeriod("garbage", "2026-08", "2027-01")).toBe(false);
  });
});

describe("defaultDateFor", () => {
  it("uses today when today falls inside the period", () => {
    const now = new Date("2026-09-15T10:00:00Z");
    expect(defaultDateFor("2026-08", "2027-01", now)).toBe("2026-09-15");
  });
  it("falls back to the first day of the period when today is before it", () => {
    const now = new Date("2026-05-02T10:00:00Z");
    expect(defaultDateFor("2026-08", "2027-01", now)).toBe("2026-08-01");
  });
  it("falls back to the first day of the last month when today is after it", () => {
    const now = new Date("2028-04-02T10:00:00Z");
    expect(defaultDateFor("2026-08", "2027-01", now)).toBe("2027-01-01");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- period`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/period.js`**

```js
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MONTHS = 120;

const LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const FULL = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

export function monthKey(isoDate) {
  if (typeof isoDate !== "string" || !DATE_RE.test(isoDate)) return null;
  return isoDate.slice(0, 7);
}

function toIndex(key) {
  if (typeof key !== "string" || !MONTH_RE.test(key)) return null;
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
}

function fromIndex(index) {
  const y = Math.floor(index / 12);
  const m = index % 12;
  return {
    key: `${y}-${String(m + 1).padStart(2, "0")}`,
    label: LABELS[m],
    full: `${FULL[m]} ${y}`,
  };
}

export function monthsInPeriod(start, end) {
  const a = toIndex(start);
  const b = toIndex(end);
  if (a === null || b === null || b < a) return [];
  const count = Math.min(b - a + 1, MAX_MONTHS);
  return Array.from({ length: count }, (_, i) => fromIndex(a + i));
}

export function findMonth(months, key) {
  const hit = (months || []).find((m) => m.key === key);
  if (hit) return hit;
  const index = toIndex(key);
  // Never return undefined; the previous implementation crashed on `.full`.
  return index === null ? { key: String(key), label: String(key), full: String(key) } : fromIndex(index);
}

export function isWithinPeriod(isoDate, start, end) {
  const key = monthKey(isoDate);
  if (!key || !MONTH_RE.test(start || "") || !MONTH_RE.test(end || "")) return false;
  return key >= start && key <= end;
}

export function defaultDateFor(start, end, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  if (isWithinPeriod(today, start, end)) return today;
  const key = monthKey(today);
  if (key && key < start) return `${start}-01`;
  return `${end}-01`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- period`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/period.js tests/period.test.js
git commit -m "feat: derive the tracking period from settings instead of hardcoded months"
```

---

### Task 5: Username validation and synthetic-email mapping

**Files:**
- Create: `src/lib/username.js`
- Create: `tests/username.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `USERNAME_DOMAIN: "team.hire3x.com"`
  - `validateUsername(input) => { ok: true } | { ok: false, reason: string }`
  - `toAuthEmail(username) => string` — throws if invalid
  - `fromAuthEmail(email) => string | null`

- [ ] **Step 1: Write the failing test**

```js
// tests/username.test.js
import { describe, it, expect } from "vitest";
import { USERNAME_DOMAIN, validateUsername, toAuthEmail, fromAuthEmail } from "../src/lib/username.js";

describe("validateUsername", () => {
  it("accepts the team's usernames", () => {
    for (const u of ["yash", "titus", "gebin", "shijin", "madesh", "a.b_c-d"]) {
      expect(validateUsername(u).ok).toBe(true);
    }
  });
  it("rejects uppercase, so there is exactly one spelling of each name", () => {
    expect(validateUsername("Yash")).toEqual({ ok: false, reason: expect.stringMatching(/lowercase/i) });
  });
  it("rejects names shorter than 3 or longer than 20 characters", () => {
    expect(validateUsername("ab").ok).toBe(false);
    expect(validateUsername("a".repeat(21)).ok).toBe(false);
  });
  it("requires the first character to be a letter", () => {
    expect(validateUsername("1abc").ok).toBe(false);
    expect(validateUsername(".abc").ok).toBe(false);
  });
  it("rejects spaces, at-signs, and other punctuation", () => {
    for (const u of ["ya sh", "ya@sh", "ya/sh", "ya+sh"]) {
      expect(validateUsername(u).ok).toBe(false);
    }
  });
  it("rejects reserved words", () => {
    for (const u of ["admin", "root", "system", "support", "api", "null", "firebase"]) {
      expect(validateUsername(u)).toEqual({ ok: false, reason: expect.stringMatching(/reserved/i) });
    }
  });
  it("rejects non-strings without throwing", () => {
    expect(validateUsername(null).ok).toBe(false);
    expect(validateUsername(undefined).ok).toBe(false);
  });
});

describe("toAuthEmail", () => {
  it("appends the synthetic domain", () => {
    expect(toAuthEmail("yash")).toBe(`yash@${USERNAME_DOMAIN}`);
  });
  it("trims and lowercases what the user typed", () => {
    expect(toAuthEmail("  Yash  ")).toBe(`yash@${USERNAME_DOMAIN}`);
  });
  it("throws rather than building an address from an invalid username", () => {
    expect(() => toAuthEmail("ya sh")).toThrow();
  });
});

describe("fromAuthEmail", () => {
  it("recovers the username", () => {
    expect(fromAuthEmail(`shijin@${USERNAME_DOMAIN}`)).toBe("shijin");
  });
  it("returns null for an address outside the synthetic domain", () => {
    expect(fromAuthEmail("someone@gmail.com")).toBeNull();
    expect(fromAuthEmail(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- username`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/username.js`**

```js
export const USERNAME_DOMAIN = "team.hire3x.com";

const PATTERN = /^[a-z][a-z0-9._-]{2,19}$/;
const RESERVED = new Set(["admin", "root", "system", "support", "api", "null", "firebase"]);

export function validateUsername(input) {
  if (typeof input !== "string") return { ok: false, reason: "Enter a username." };
  const value = input.trim();
  if (value.length < 3) return { ok: false, reason: "Username needs at least 3 characters." };
  if (value.length > 20) return { ok: false, reason: "Username can be at most 20 characters." };
  if (value !== value.toLowerCase()) return { ok: false, reason: "Username must be lowercase." };
  if (!/^[a-z]/.test(value)) return { ok: false, reason: "Username must start with a letter." };
  if (!PATTERN.test(value)) {
    return { ok: false, reason: "Use only letters, numbers, dots, underscores and hyphens." };
  }
  if (RESERVED.has(value)) return { ok: false, reason: "That username is reserved. Pick another." };
  return { ok: true };
}

export function toAuthEmail(username) {
  const value = String(username ?? "").trim().toLowerCase();
  const check = validateUsername(value);
  if (!check.ok) throw new Error(check.reason);
  return `${value}@${USERNAME_DOMAIN}`;
}

export function fromAuthEmail(email) {
  if (typeof email !== "string") return null;
  const suffix = `@${USERNAME_DOMAIN}`;
  if (!email.endsWith(suffix)) return null;
  return email.slice(0, -suffix.length);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- username`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/username.js tests/username.test.js
git commit -m "feat: map usernames onto Firebase Auth synthetic addresses"
```

---

### Task 6: Security rules and their emulator-backed tests

This is the security core of the whole system. Rules are written and proven **before**
any UI touches Firestore. Fixes spec failure point #9.

**Files:**
- Create: `firestore.rules`
- Create: `vitest.rules.config.js`
- Create: `tests/rules/helpers.js`
- Create: `tests/rules/expenses.rules.test.js`
- Create: `tests/rules/privilege.rules.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: a deployed rule set guaranteeing that `/users` is client-unwritable, that
  budgets are admin-only, and that audit entries are create-only and self-attributed.

- [ ] **Step 1: Write `firestore.rules`**

The `TEST-SENTINEL` comment is load-bearing: the test suite locates it to swap the real
UIDs for test ones. Never remove it.

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Mirrors src/shared/roles.js. Both lists must hold the same two UIDs.
    function superAdmins() {
      // TEST-SENTINEL:SUPERADMINS
      return ['REPLACE_WITH_YASH_UID', 'REPLACE_WITH_TITUS_UID'];
    }

    function signedIn() { return request.auth != null; }
    function uid()      { return request.auth.uid; }
    function profile()  { return get(/databases/$(database)/documents/users/$(uid())).data; }
    function isActive() {
      return signedIn()
        && exists(/databases/$(database)/documents/users/$(uid()))
        && profile().disabled != true;
    }
    function isSuper() { return signedIn() && uid() in superAdmins(); }
    function isAdmin() { return isSuper() || (signedIn() && request.auth.token.role == 'admin'); }

    function settings()   { return get(/databases/$(database)/documents/settings/app).data; }
    function inPeriod(m)  { return m >= settings().periodStart && m <= settings().periodEnd; }

    function expenseKeys() {
      return ['description','amount','date','month','category','invoice','notes',
              'createdBy','createdAt','updatedBy','updatedAt'];
    }

    function validExpense(d) {
      return d.keys().hasOnly(expenseKeys())
        && d.keys().hasAll(['description','amount','date','month','category',
                            'createdBy','createdAt','updatedBy','updatedAt'])
        && d.description is string && d.description.size() > 0 && d.description.size() <= 200
        && d.amount is number && d.amount > 0 && d.amount <= 100000000
        && d.date is string && d.date.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        && d.month is string && d.date.matches('^' + d.month + '-[0-9]{2}$')
        && d.category is string && d.category.size() > 0 && d.category.size() <= 60
        && (!('invoice' in d.keys()) || (d.invoice is string && d.invoice.size() <= 80))
        && (!('notes' in d.keys()) || (d.notes is string && d.notes.size() <= 1000));
    }

    match /settings/{doc} {
      allow read:  if signedIn();
      allow write: if isAdmin() && isActive();
    }

    // Written only by the backend Admin SDK, which bypasses these rules entirely.
    // Denying all client writes is what makes role escalation impossible.
    match /users/{userId} {
      allow read:  if signedIn();
      allow write: if false;
    }

    match /expenses/{expenseId} {
      allow read: if signedIn() && isActive();

      allow create: if signedIn() && isActive()
        && validExpense(request.resource.data)
        && request.resource.data.createdBy == uid()
        && request.resource.data.updatedBy == uid()
        && inPeriod(request.resource.data.month);

      allow update: if signedIn() && isActive()
        && validExpense(request.resource.data)
        && request.resource.data.updatedBy == uid()
        && request.resource.data.createdBy == resource.data.createdBy
        && request.resource.data.createdAt == resource.data.createdAt
        && inPeriod(request.resource.data.month);

      allow delete: if signedIn() && isActive();
    }

    match /budgets/{monthKey} {
      allow read: if signedIn() && isActive();
      allow write: if isAdmin() && isActive()
        && request.resource.data.keys().hasOnly(['amount','updatedBy','updatedAt'])
        && request.resource.data.amount is number
        && request.resource.data.amount >= 0
        && request.resource.data.amount <= 1000000000
        && request.resource.data.updatedBy == uid()
        && monthKey.matches('^[0-9]{4}-[0-9]{2}$')
        && inPeriod(monthKey);
    }

    match /audit/{entryId} {
      allow read:   if signedIn();
      allow create: if signedIn() && isActive()
        && request.resource.data.by == uid()
        && request.resource.data.at == request.time;
      allow update, delete: if false;
    }

    match /presence/{userId} {
      allow read:  if signedIn();
      allow write: if signedIn() && userId == uid();
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 2: Create `vitest.rules.config.js`**

Rules tests run against the emulator in a `node` environment and are excluded from the
default `npm test` run, so a developer without the emulator can still run unit tests.

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/rules/**/*.test.js"],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
```

- [ ] **Step 3: Create `tests/rules/helpers.js`**

```js
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

export const YASH = "uid_yash";
export const TITUS = "uid_titus";
export const ADMIN = "uid_admin";
export const MEMBER = "uid_member";
export const DISABLED = "uid_disabled";

// Swap the production super-admin UIDs for test ones. The sentinel comment in
// firestore.rules marks the line; if it is ever removed, loadRules() throws rather
// than silently testing the wrong identities.
export function loadRules() {
  const raw = readFileSync("firestore.rules", "utf8");
  const pattern = /\/\/ TEST-SENTINEL:SUPERADMINS\s*\n\s*return \[[^\]]*\];/;
  if (!pattern.test(raw)) {
    throw new Error("TEST-SENTINEL:SUPERADMINS missing from firestore.rules");
  }
  return raw.replace(
    pattern,
    `// TEST-SENTINEL:SUPERADMINS\n      return ['${YASH}', '${TITUS}'];`
  );
}

export async function makeEnv() {
  return initializeTestEnvironment({
    projectId: "rules-test",
    firestore: { rules: loadRules(), host: "127.0.0.1", port: 8080 },
  });
}

export async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "settings/app"), {
      periodStart: "2026-08",
      periodEnd: "2027-01",
      categories: [{ id: "meta", label: "Meta Ads", color: "sky", recurring: false }],
      currency: "INR",
    });
    const people = [
      [YASH, "yash", "superadmin", false],
      [TITUS, "titus", "superadmin", false],
      [ADMIN, "adminuser", "admin", false],
      [MEMBER, "member", "member", false],
      [DISABLED, "gone", "member", true],
    ];
    for (const [uid, username, role, disabled] of people) {
      await setDoc(doc(db, `users/${uid}`), { username, role, disabled, mustChangePassword: false });
    }
  });
}

// Custom claims are the second argument; this is how rules see request.auth.token.role.
export const as = (env, uid, role) => env.authenticatedContext(uid, { role }).firestore();

export const validExpense = (uid, over = {}) => ({
  description: "Meta ads sprint",
  amount: 25000,
  date: "2026-09-12",
  month: "2026-09",
  category: "meta",
  createdBy: uid,
  createdAt: new Date("2026-09-12T00:00:00Z"),
  updatedBy: uid,
  updatedAt: new Date("2026-09-12T00:00:00Z"),
  ...over,
});
```

- [ ] **Step 4: Write the privilege test — the one that matters most**

```js
// tests/rules/privilege.rules.test.js
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { makeEnv, seed, as, YASH, ADMIN, MEMBER, DISABLED } from "./helpers.js";

let env;
beforeAll(async () => { env = await makeEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(env); });

describe("/users is unwritable from every client", () => {
  it("blocks a member editing their own role", async () => {
    await assertFails(updateDoc(doc(as(env, MEMBER, "member"), `users/${MEMBER}`), { role: "admin" }));
  });
  it("blocks an admin promoting anyone", async () => {
    await assertFails(updateDoc(doc(as(env, ADMIN, "admin"), `users/${MEMBER}`), { role: "admin" }));
  });
  it("blocks a super-admin too, since all role changes go through the API", async () => {
    await assertFails(updateDoc(doc(as(env, YASH, "superadmin"), `users/${MEMBER}`), { role: "admin" }));
  });
  it("blocks anyone disabling a super-admin", async () => {
    await assertFails(updateDoc(doc(as(env, ADMIN, "admin"), `users/${YASH}`), { disabled: true }));
  });
  it("still allows reading the roster, which the UI needs for attribution", async () => {
    await assertSucceeds(getDoc(doc(as(env, MEMBER, "member"), `users/${ADMIN}`)));
  });
});

describe("a forged role claim does not grant super-admin", () => {
  it("rejects a member who mints themselves a superadmin claim", async () => {
    // A real client cannot set this claim; the test proves the UID list is what counts.
    const forged = as(env, MEMBER, "superadmin");
    await assertFails(setDoc(doc(forged, "budgets/2026-09"),
      { amount: 500000, updatedBy: MEMBER, updatedAt: serverTimestamp() }));
  });
});

describe("budgets are admin-only", () => {
  const budget = (uid) => ({ amount: 500000, updatedBy: uid, updatedAt: serverTimestamp() });
  it("lets an admin set one", async () => {
    await assertSucceeds(setDoc(doc(as(env, ADMIN, "admin"), "budgets/2026-09"), budget(ADMIN)));
  });
  it("lets a super-admin set one even with no role claim present", async () => {
    await assertSucceeds(setDoc(doc(as(env, YASH, undefined), "budgets/2026-09"), budget(YASH)));
  });
  it("blocks a member", async () => {
    await assertFails(setDoc(doc(as(env, MEMBER, "member"), "budgets/2026-09"), budget(MEMBER)));
  });
  it("blocks a month outside the configured period", async () => {
    await assertFails(setDoc(doc(as(env, ADMIN, "admin"), "budgets/2027-06"), budget(ADMIN)));
  });
  it("blocks a negative amount", async () => {
    await assertFails(setDoc(doc(as(env, ADMIN, "admin"), "budgets/2026-09"),
      { ...budget(ADMIN), amount: -1 }));
  });
  it("blocks attributing the write to someone else", async () => {
    await assertFails(setDoc(doc(as(env, ADMIN, "admin"), "budgets/2026-09"), budget(MEMBER)));
  });
});

describe("disabled accounts are locked out", () => {
  it("blocks a disabled user reading expenses", async () => {
    await assertFails(getDoc(doc(as(env, DISABLED, "member"), "expenses/anything")));
  });
});

describe("the audit log is append-only and self-attributed", () => {
  const entry = (uid) => ({ at: serverTimestamp(), by: uid, action: "expense.create", entityId: "e1", summary: "x" });
  it("lets a user record their own action", async () => {
    await assertSucceeds(setDoc(doc(as(env, MEMBER, "member"), "audit/a1"), entry(MEMBER)));
  });
  it("blocks attributing an entry to someone else", async () => {
    await assertFails(setDoc(doc(as(env, MEMBER, "member"), "audit/a2"), entry(ADMIN)));
  });
  it("blocks editing or deleting an existing entry", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "audit/a3"), { at: new Date(), by: MEMBER, action: "x", entityId: "e", summary: "s" });
    });
    const db = as(env, MEMBER, "member");
    await assertFails(updateDoc(doc(db, "audit/a3"), { summary: "rewritten" }));
    await assertFails(deleteDoc(doc(db, "audit/a3")));
  });
});
```

- [ ] **Step 5: Write the expense-validation test**

```js
// tests/rules/expenses.rules.test.js
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { makeEnv, seed, as, validExpense, ADMIN, MEMBER } from "./helpers.js";

let env;
beforeAll(async () => { env = await makeEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(env); });

const memberDb = () => as(env, MEMBER, "member");

describe("expense creation", () => {
  it("accepts a well-formed expense from any active member", async () => {
    await assertSucceeds(setDoc(doc(memberDb(), "expenses/e1"), validExpense(MEMBER)));
  });
  it("rejects attributing the expense to another user", async () => {
    await assertFails(setDoc(doc(memberDb(), "expenses/e2"),
      validExpense(MEMBER, { createdBy: ADMIN })));
  });
  it("rejects a month that disagrees with the date", async () => {
    await assertFails(setDoc(doc(memberDb(), "expenses/e3"),
      validExpense(MEMBER, { date: "2026-09-12", month: "2026-10" })));
  });
  it("rejects a date outside the configured period", async () => {
    await assertFails(setDoc(doc(memberDb(), "expenses/e4"),
      validExpense(MEMBER, { date: "2027-06-01", month: "2027-06" })));
  });
  it("rejects zero, negative, and absurd amounts", async () => {
    for (const amount of [0, -100, 100000001]) {
      await assertFails(setDoc(doc(memberDb(), `expenses/amt${amount}`),
        validExpense(MEMBER, { amount })));
    }
  });
  it("rejects a string amount, which would break every total", async () => {
    await assertFails(setDoc(doc(memberDb(), "expenses/e5"),
      validExpense(MEMBER, { amount: "25000" })));
  });
  it("rejects an empty or over-long description", async () => {
    await assertFails(setDoc(doc(memberDb(), "expenses/e6"),
      validExpense(MEMBER, { description: "" })));
    await assertFails(setDoc(doc(memberDb(), "expenses/e7"),
      validExpense(MEMBER, { description: "x".repeat(201) })));
  });
  it("rejects unknown fields, so no client can smuggle data in", async () => {
    await assertFails(setDoc(doc(memberDb(), "expenses/e8"),
      validExpense(MEMBER, { approved: true })));
  });
});

describe("expense updates", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "expenses/e1"), validExpense(MEMBER));
    });
  });
  it("lets a different teammate edit and stamps them as the editor", async () => {
    await assertSucceeds(setDoc(doc(as(env, ADMIN, "admin"), "expenses/e1"),
      validExpense(MEMBER, { updatedBy: ADMIN, description: "Revised" })));
  });
  it("rejects an edit that does not stamp the real editor", async () => {
    await assertFails(setDoc(doc(as(env, ADMIN, "admin"), "expenses/e1"),
      validExpense(MEMBER, { description: "Revised" })));
  });
  it("rejects rewriting the original author", async () => {
    await assertFails(setDoc(doc(as(env, ADMIN, "admin"), "expenses/e1"),
      validExpense(MEMBER, { createdBy: ADMIN, updatedBy: ADMIN })));
  });
  it("lets any active member delete", async () => {
    await assertSucceeds(deleteDoc(doc(memberDb(), "expenses/e1")));
  });
});

describe("signed-out access", () => {
  it("is refused everywhere", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anon, "expenses/x"), validExpense("nobody")));
    await assertFails(setDoc(doc(anon, "audit/x"), { by: "nobody" }));
  });
});
```

- [ ] **Step 6: Run the rules suite**

Start the emulator in a second terminal with `npm run emulators`, or let the script
manage it:

Run: `npm run test:rules`
Expected: PASS. If `initializeTestEnvironment` cannot reach port 8080, the emulator is
not running — that is a setup error, not a rules failure.

- [ ] **Step 7: Commit**

```bash
git add firestore.rules vitest.rules.config.js tests/rules/
git commit -m "feat: add Firestore security rules with emulator-backed tests"
```

---

### Task 7: The shared super-admin registry

One module, imported by both the browser and the backend, so the permission matrix has
exactly one definition. This is what makes super-admin immutability real rather than
duplicated-and-hopefully-consistent.

**Files:**
- Create: `src/shared/roles.js`
- Create: `tests/roles.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SUPER_ADMIN_UIDS: readonly string[]`
  - `isSuperAdmin(uid) => boolean`
  - `effectiveRole(uid, storedRole) => "superadmin" | "admin" | "member"`
  - `canManageUsers(role) => boolean`
  - `canAssignRoles(role) => boolean`
  - `canActOn({ actorUid, actorRole, targetUid, targetRole }) => boolean`

- [ ] **Step 1: Write the failing test**

```js
// tests/roles.test.js
import { describe, it, expect } from "vitest";
import {
  SUPER_ADMIN_UIDS, isSuperAdmin, effectiveRole,
  canManageUsers, canAssignRoles, canActOn,
} from "../src/shared/roles.js";

const YASH = SUPER_ADMIN_UIDS[0];
const TITUS = SUPER_ADMIN_UIDS[1];

describe("the registry itself", () => {
  it("holds exactly two super-admins", () => {
    expect(SUPER_ADMIN_UIDS).toHaveLength(2);
  });
  it("holds no unreplaced placeholders", () => {
    for (const uid of SUPER_ADMIN_UIDS) {
      expect(uid).not.toMatch(/REPLACE_WITH/);
      expect(uid.length).toBeGreaterThan(10);
    }
  });
  it("cannot be mutated at runtime", () => {
    expect(() => SUPER_ADMIN_UIDS.push("uid_attacker")).toThrow();
  });
});

describe("effectiveRole", () => {
  it("returns superadmin for a listed UID no matter what the document says", () => {
    expect(effectiveRole(YASH, "member")).toBe("superadmin");
    expect(effectiveRole(TITUS, undefined)).toBe("superadmin");
  });
  it("passes through a valid stored role for anyone else", () => {
    expect(effectiveRole("uid_x", "admin")).toBe("admin");
  });
  it("falls back to member for an unknown or missing role", () => {
    expect(effectiveRole("uid_x", "wizard")).toBe("member");
    expect(effectiveRole("uid_x", null)).toBe("member");
  });
});

describe("canManageUsers / canAssignRoles", () => {
  it("lets super-admins and admins manage users", () => {
    expect(canManageUsers("superadmin")).toBe(true);
    expect(canManageUsers("admin")).toBe(true);
    expect(canManageUsers("member")).toBe(false);
  });
  it("lets only super-admins assign roles", () => {
    expect(canAssignRoles("superadmin")).toBe(true);
    expect(canAssignRoles("admin")).toBe(false);
  });
});

describe("canActOn", () => {
  const act = (actorUid, actorRole, targetUid, targetRole) =>
    canActOn({ actorUid, actorRole, targetUid, targetRole });

  it("never lets anyone act on a super-admin", () => {
    expect(act(TITUS, "superadmin", YASH, "superadmin")).toBe(false);
    expect(act("uid_a", "admin", YASH, "superadmin")).toBe(false);
    expect(act("uid_m", "member", YASH, "superadmin")).toBe(false);
  });
  it("lets a super-admin act on admins and members", () => {
    expect(act(YASH, "superadmin", "uid_a", "admin")).toBe(true);
    expect(act(YASH, "superadmin", "uid_m", "member")).toBe(true);
  });
  it("lets an admin act on members only", () => {
    expect(act("uid_a", "admin", "uid_m", "member")).toBe(true);
    expect(act("uid_a", "admin", "uid_b", "admin")).toBe(false);
  });
  it("does not let an admin act on themselves through this path", () => {
    expect(act("uid_a", "admin", "uid_a", "admin")).toBe(false);
  });
  it("never lets a member act on anyone", () => {
    expect(act("uid_m", "member", "uid_n", "member")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- roles`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/shared/roles.js`**

Note the placeholders: Task 11 replaces them with the real UIDs, and the test above
fails loudly until it does.

```js
// Imported by BOTH the browser bundle and the /api backend.
// Keep this list identical to superAdmins() in firestore.rules.
export const SUPER_ADMIN_UIDS = Object.freeze([
  "REPLACE_WITH_YASH_UID",
  "REPLACE_WITH_TITUS_UID",
]);

export const ROLES = Object.freeze(["superadmin", "admin", "member"]);

export function isSuperAdmin(uid) {
  return typeof uid === "string" && SUPER_ADMIN_UIDS.includes(uid);
}

export function effectiveRole(uid, storedRole) {
  if (isSuperAdmin(uid)) return "superadmin";
  return ROLES.includes(storedRole) && storedRole !== "superadmin" ? storedRole : "member";
}

export function canManageUsers(role) {
  return role === "superadmin" || role === "admin";
}

export function canAssignRoles(role) {
  return role === "superadmin";
}

export function canActOn({ actorUid, actorRole, targetUid, targetRole }) {
  // Nobody, including the other super-admin, may act on a super-admin.
  if (isSuperAdmin(targetUid)) return false;
  if (actorUid === targetUid) return false;
  if (actorRole === "superadmin") return true;
  if (actorRole === "admin") return targetRole === "member";
  return false;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- roles`
Expected: the three registry assertions FAIL on the placeholders; every behavioural test
PASSES. Leave the registry tests failing — Task 11 turns them green. Note this
deliberately in the commit message so a reviewer is not alarmed.

- [ ] **Step 5: Commit**

```bash
git add src/shared/roles.js tests/roles.test.js
git commit -m "feat: add the shared super-admin registry and permission guards

The three registry assertions fail until scripts/bootstrap.mjs (Task 11)
substitutes real UIDs for the placeholders. This is intentional."
```

---

### Task 8: Backend foundation — Admin SDK and request guard

**Files:**
- Create: `tsconfig.json`
- Create: `api/_lib/admin.ts`
- Create: `api/_lib/http.ts`
- Create: `api/_lib/guard.ts`
- Create: `src/lib/api.js`
- Create: `tests/api-guard.test.js`

**Interfaces:**
- Consumes: `src/shared/roles.js`, `src/lib/username.js`.
- Produces:
  - `adminAuth()`, `adminDb()` — lazily initialised Admin SDK handles
  - `HttpError(status, message)` — thrown by guards, caught by `handle()`
  - `handle(fn)` — wraps a route with method checking and error mapping
  - `requireCaller(req) => Promise<{ uid, username, role }>`
  - `writeAudit({ by, byUsername, action, entityId, summary, before, after })`
  - `callApi(path, body) => Promise<any>` — client side, attaches the ID token

- [ ] **Step 1: Create `tsconfig.json`**

`allowJs` matters: the TypeScript routes import `src/shared/roles.js` directly so the
registry has one physical definition.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "allowJs": true,
    "checkJs": false,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["api/**/*.ts", "src/**/*.js", "src/**/*.jsx"]
}
```

- [ ] **Step 2: Implement `api/_lib/admin.ts`**

```ts
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
    cached = getApps()[0] ?? initializeApp({ credential: cert(credentials()) });
  }
  return cached;
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
```

- [ ] **Step 3: Implement `api/_lib/http.ts`**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

export function handle(fn: Handler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST." });
    }
    try {
      const body = await fn(req, res);
      if (!res.writableEnded) res.status(200).json(body ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
      }
      // Never leak an internal stack to the browser.
      console.error("Unhandled API error", err);
      return res.status(500).json({ error: "Something went wrong. Try again." });
    }
  };
}

export function requireString(body: unknown, field: string, max = 200): string {
  const value = (body as Record<string, unknown>)?.[field];
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new HttpError(400, `"${field}" is required.`);
  }
  return value.trim();
}
```

- [ ] **Step 4: Implement `api/_lib/guard.ts`**

```ts
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
```

- [ ] **Step 5: Implement the client wrapper `src/lib/api.js`**

```js
import { auth } from "./firebase.js";

export async function callApi(path, body = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to continue.");
  const token = await user.getIdToken();

  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  let payload = {};
  try {
    payload = await res.json();
  } catch {
    // A non-JSON body means the SPA rewrite swallowed the request.
    throw new Error("The server did not respond correctly. Check the /api routing.");
  }
  if (!res.ok) throw new Error(payload.error || "Something went wrong. Try again.");
  return payload;
}
```

- [ ] **Step 6: Write the guard test**

```js
// tests/api-guard.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { canActOn, effectiveRole, SUPER_ADMIN_UIDS } from "../src/shared/roles.js";

// requireTarget's decision logic lives entirely in canActOn, so the behaviour that
// matters is asserted without standing up the Admin SDK. Read the UID from the
// registry rather than hardcoding one, so this keeps testing the real identities
// after Task 11 substitutes them.
describe("the guard's decision surface", () => {
  it("refuses a target that is a super-admin, whoever asks", () => {
    const [yash, titus] = SUPER_ADMIN_UIDS;
    expect(canActOn({
      actorUid: titus, actorRole: "superadmin",
      targetUid: yash, targetRole: "superadmin",
    })).toBe(false);
  });
  it("treats a stored role of superadmin on an unlisted UID as member", () => {
    expect(effectiveRole("uid_impostor", "superadmin")).toBe("member");
  });
});

describe("callApi error surfacing", () => {
  beforeEach(() => { vi.resetModules(); });
  it("explains a non-JSON response instead of throwing a parse error", async () => {
    vi.doMock("../src/lib/firebase.js", () => ({
      auth: { currentUser: { getIdToken: async () => "tok" } },
    }));
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => { throw new SyntaxError("Unexpected token <"); },
    }));
    const { callApi } = await import("../src/lib/api.js");
    await expect(callApi("users/create", {})).rejects.toThrow(/api routing/i);
  });
  it("surfaces the server's message on a 403", async () => {
    vi.doMock("../src/lib/firebase.js", () => ({
      auth: { currentUser: { getIdToken: async () => "tok" } },
    }));
    global.fetch = vi.fn(async () => ({
      ok: false, json: async () => ({ error: "You do not have permission to do that." }),
    }));
    const { callApi } = await import("../src/lib/api.js");
    await expect(callApi("users/set-role", {})).rejects.toThrow(/permission/i);
  });
});
```

- [ ] **Step 7: Run the tests**

Run: `npm test -- api-guard`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tsconfig.json api/_lib/ src/lib/api.js tests/api-guard.test.js
git commit -m "feat: add the backend Admin SDK bootstrap, request guard, and API client"
```

---

### Task 9: Create-teammate route

**Files:**
- Create: `src/lib/password.js`
- Create: `api/users/create.ts`
- Create: `tests/password.test.js`

**Interfaces:**
- Consumes: `requireCaller`, `writeAudit`, `HttpError`, `handle`, `requireString`, `validateUsername`, `toAuthEmail`, `canManageUsers`.
- Produces:
  - `generateTempPassword() => string`
  - `validatePassword(value) => { ok: true } | { ok: false, reason: string }`
  - `POST /api/users/create` accepting `{ username, displayName, tempPassword, role }` and returning `{ uid, username }`.

- [ ] **Step 1: Write the failing password test**

```js
// tests/password.test.js
import { describe, it, expect } from "vitest";
import { generateTempPassword, validatePassword } from "../src/lib/password.js";

describe("generateTempPassword", () => {
  it("produces a password that passes its own validator", () => {
    for (let i = 0; i < 200; i++) {
      expect(validatePassword(generateTempPassword()).ok).toBe(true);
    }
  });
  it("produces a different password each time", () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateTempPassword()));
    expect(seen.size).toBe(100);
  });
  it("avoids characters that are misread when dictated over chat", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword()).not.toMatch(/[O0Il1]/);
    }
  });
});

describe("validatePassword", () => {
  it("accepts a strong password", () => {
    expect(validatePassword("Marketing-2026x").ok).toBe(true);
  });
  it("rejects anything under 10 characters", () => {
    expect(validatePassword("Abc-123x").ok).toBe(false);
  });
  it("requires a letter and a digit so a passphrase of one class is refused", () => {
    expect(validatePassword("abcdefghijkl").ok).toBe(false);
    expect(validatePassword("123456789012").ok).toBe(false);
  });
  it("rejects non-strings and empty input without throwing", () => {
    for (const bad of [null, undefined, 12345, ""]) {
      expect(validatePassword(bad).ok).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- password`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/password.js`**

```js
// O/0 and I/l/1 are omitted: these passwords get read aloud or typed from a chat message.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const LENGTH = 14;

export function generateTempPassword() {
  const bytes = new Uint32Array(LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  // Guarantee both character classes rather than trusting chance.
  return out.slice(0, LENGTH - 2) + "7" + "k";
}

export function validatePassword(value) {
  if (typeof value !== "string") return { ok: false, reason: "Enter a password." };
  if (value.length < 10) return { ok: false, reason: "Use at least 10 characters." };
  if (value.length > 128) return { ok: false, reason: "That password is too long." };
  if (!/[A-Za-z]/.test(value)) return { ok: false, reason: "Include at least one letter." };
  if (!/[0-9]/.test(value)) return { ok: false, reason: "Include at least one number." };
  return { ok: true };
}
```

- [ ] **Step 4: Run the password tests**

Run: `npm test -- password`
Expected: PASS.

- [ ] **Step 5: Implement `api/users/create.ts`**

```ts
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../_lib/admin";
import { handle, HttpError, requireString } from "../_lib/http";
import { requireCaller, writeAudit } from "../_lib/guard";
import { validateUsername, toAuthEmail } from "../../src/lib/username.js";
import { validatePassword } from "../../src/lib/password.js";
import { canManageUsers, canAssignRoles } from "../../src/shared/roles.js";

export default handle(async (req) => {
  const caller = await requireCaller(req);
  if (!canManageUsers(caller.role)) {
    throw new HttpError(403, "Only admins can add teammates.");
  }

  const username = requireString(req.body, "username", 20).toLowerCase();
  const displayName = requireString(req.body, "displayName", 60);
  const tempPassword = requireString(req.body, "tempPassword", 128);
  const role = (req.body?.role ?? "member") as string;

  const nameCheck = validateUsername(username);
  if (!nameCheck.ok) throw new HttpError(400, nameCheck.reason);

  const pwCheck = validatePassword(tempPassword);
  if (!pwCheck.ok) throw new HttpError(400, pwCheck.reason);

  if (role === "superadmin") {
    throw new HttpError(403, "Super-admins cannot be created. That list is fixed.");
  }
  if (role !== "member" && role !== "admin") {
    throw new HttpError(400, "Role must be member or admin.");
  }
  if (role === "admin" && !canAssignRoles(caller.role)) {
    throw new HttpError(403, "Only a super-admin can create another admin.");
  }

  let created;
  try {
    created = await adminAuth().createUser({
      email: toAuthEmail(username),
      password: tempPassword,
      displayName,
    });
  } catch (err: any) {
    if (err?.code === "auth/email-already-exists") {
      throw new HttpError(409, `The username "${username}" is already taken.`);
    }
    throw err;
  }

  await adminAuth().setCustomUserClaims(created.uid, { role });

  await adminDb().doc(`users/${created.uid}`).set({
    username,
    displayName,
    role,
    mustChangePassword: true,
    disabled: false,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: caller.uid,
    lastLoginAt: null,
  });

  await writeAudit({
    by: caller.uid,
    byUsername: caller.username,
    action: "user.create",
    entityId: created.uid,
    summary: `Created @${username} as ${role}`,
  });

  // The temp password is never persisted and never echoed back; the caller typed it.
  return { uid: created.uid, username };
});
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/password.js api/users/create.ts tests/password.test.js
git commit -m "feat: add the create-teammate API route and temp-password helpers"
```

---

### Task 10: The remaining four user-management routes

**Files:**
- Create: `api/users/reset-password.ts`
- Create: `api/users/set-role.ts`
- Create: `api/users/set-disabled.ts`
- Create: `api/users/clear-must-change.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 8 and 9.
- Produces: `POST /api/users/reset-password`, `/set-role`, `/set-disabled`, `/clear-must-change`.

- [ ] **Step 1: Implement `api/users/reset-password.ts`**

```ts
import { adminAuth, adminDb } from "../_lib/admin";
import { handle, HttpError, requireString } from "../_lib/http";
import { requireCaller, requireTarget, writeAudit } from "../_lib/guard";
import { validatePassword } from "../../src/lib/password.js";
import { canManageUsers } from "../../src/shared/roles.js";

export default handle(async (req) => {
  const caller = await requireCaller(req);
  if (!canManageUsers(caller.role)) throw new HttpError(403, "Only admins can reset passwords.");

  const targetUid = requireString(req.body, "uid", 128);
  const tempPassword = requireString(req.body, "tempPassword", 128);

  const check = validatePassword(tempPassword);
  if (!check.ok) throw new HttpError(400, check.reason);

  const target = await requireTarget(caller, targetUid);

  await adminAuth().updateUser(targetUid, { password: tempPassword });
  await adminDb().doc(`users/${targetUid}`).update({ mustChangePassword: true });
  // Force every existing session of that account to re-authenticate.
  await adminAuth().revokeRefreshTokens(targetUid);

  await writeAudit({
    by: caller.uid, byUsername: caller.username,
    action: "user.passwordReset", entityId: targetUid,
    summary: `Reset the password for @${target.data.username}`,
  });

  return { ok: true };
});
```

- [ ] **Step 2: Implement `api/users/set-role.ts`**

```ts
import { adminAuth, adminDb } from "../_lib/admin";
import { handle, HttpError, requireString } from "../_lib/http";
import { requireCaller, requireTarget, writeAudit } from "../_lib/guard";
import { canAssignRoles } from "../../src/shared/roles.js";

export default handle(async (req) => {
  const caller = await requireCaller(req);
  if (!canAssignRoles(caller.role)) {
    throw new HttpError(403, "Only a super-admin can change roles.");
  }

  const targetUid = requireString(req.body, "uid", 128);
  const role = requireString(req.body, "role", 20);

  if (role === "superadmin") {
    throw new HttpError(403, "The super-admin list is fixed and cannot be extended.");
  }
  if (role !== "member" && role !== "admin") {
    throw new HttpError(400, "Role must be member or admin.");
  }

  const target = await requireTarget(caller, targetUid);
  if (target.role === role) return { ok: true, unchanged: true };

  await adminAuth().setCustomUserClaims(targetUid, { role });
  await adminDb().doc(`users/${targetUid}`).update({ role });
  // The new claim only reaches the client on the next token refresh; forcing one
  // means the change takes effect immediately rather than within the hour.
  await adminAuth().revokeRefreshTokens(targetUid);

  await writeAudit({
    by: caller.uid, byUsername: caller.username,
    action: "user.role", entityId: targetUid,
    summary: `Changed @${target.data.username} from ${target.role} to ${role}`,
    before: target.role, after: role,
  });

  return { ok: true };
});
```

- [ ] **Step 3: Implement `api/users/set-disabled.ts`**

```ts
import { adminAuth, adminDb } from "../_lib/admin";
import { handle, HttpError, requireString } from "../_lib/http";
import { requireCaller, requireTarget, writeAudit } from "../_lib/guard";
import { canManageUsers } from "../../src/shared/roles.js";

export default handle(async (req) => {
  const caller = await requireCaller(req);
  if (!canManageUsers(caller.role)) throw new HttpError(403, "Only admins can do that.");

  const targetUid = requireString(req.body, "uid", 128);
  const disabled = req.body?.disabled;
  if (typeof disabled !== "boolean") throw new HttpError(400, '"disabled" must be true or false.');

  const target = await requireTarget(caller, targetUid);

  await adminAuth().updateUser(targetUid, { disabled });
  await adminDb().doc(`users/${targetUid}`).update({ disabled });
  if (disabled) await adminAuth().revokeRefreshTokens(targetUid);

  await writeAudit({
    by: caller.uid, byUsername: caller.username,
    action: "user.disable", entityId: targetUid,
    summary: `${disabled ? "Disabled" : "Re-enabled"} @${target.data.username}`,
    after: disabled,
  });

  return { ok: true };
});
```

- [ ] **Step 4: Implement `api/users/clear-must-change.ts`**

The only route a member may call on themselves. It takes no target: the caller is the
subject, so there is nothing to escalate.

```ts
import { adminDb } from "../_lib/admin";
import { handle } from "../_lib/http";
import { requireCaller, writeAudit } from "../_lib/guard";

export default handle(async (req) => {
  const caller = await requireCaller(req);

  await adminDb().doc(`users/${caller.uid}`).update({
    mustChangePassword: false,
  });

  await writeAudit({
    by: caller.uid, byUsername: caller.username,
    action: "user.passwordChanged", entityId: caller.uid,
    summary: `@${caller.username} set a new password`,
  });

  return { ok: true };
});
```

- [ ] **Step 5: Type-check the backend**

Run: `npx tsc --noEmit`
Expected: no errors. Fix any import-path complaints before committing.

- [ ] **Step 6: Commit**

```bash
git add api/users/
git commit -m "feat: add password reset, role, disable, and password-change API routes"
```

---

### Task 11: Bootstrap the two super-admins

**Files:**
- Create: `scripts/bootstrap.mjs`
- Modify: `src/shared/roles.js` (substitute real UIDs)
- Modify: `firestore.rules` (substitute real UIDs)

**Interfaces:**
- Consumes: `src/lib/username.js`, `src/lib/password.js`.
- Produces: two Firebase Auth accounts with `superadmin` claims, their `/users`
  documents, a seeded `/settings/app`, and the two UIDs printed for substitution.

- [ ] **Step 1: Human setup — download a service-account key**

In the Firebase console: **Project settings → Service accounts → Generate new private
key**. Save it in the repo root as `serviceAccount.json`. `.gitignore` already excludes
it. This file grants full admin access to the project — it is deleted in Step 6.

- [ ] **Step 2: Implement `scripts/bootstrap.mjs`**

```js
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { toAuthEmail, validateUsername } from "../src/lib/username.js";
import { generateTempPassword } from "../src/lib/password.js";

const SUPER_ADMINS = [
  { username: "yash", displayName: "Yash" },
  { username: "titus", displayName: "Titus" },
];

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

initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccount.json", "utf8"))) });
const auth = getAuth();
const db = getFirestore();

const results = [];

for (const person of SUPER_ADMINS) {
  const check = validateUsername(person.username);
  if (!check.ok) throw new Error(`${person.username}: ${check.reason}`);

  const email = toAuthEmail(person.username);
  const tempPassword = generateTempPassword();

  let user;
  try {
    user = await auth.createUser({ email, password: tempPassword, displayName: person.displayName });
  } catch (err) {
    if (err.code !== "auth/email-already-exists") throw err;
    // Idempotent: re-running repairs claims and documents without duplicating accounts.
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password: tempPassword });
    console.log(`  (existing account for @${person.username} reused; password reset)`);
  }

  await auth.setCustomUserClaims(user.uid, { role: "superadmin" });
  await db.doc(`users/${user.uid}`).set({
    username: person.username,
    displayName: person.displayName,
    role: "superadmin",
    mustChangePassword: true,
    disabled: false,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "bootstrap",
    lastLoginAt: null,
  }, { merge: true });

  results.push({ ...person, uid: user.uid, tempPassword });
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
  console.log(`  @${r.username}  uid=${r.uid}  temp password: ${r.tempPassword}`);
}
console.log("\n=== Paste these UIDs into BOTH files ===");
console.log(`  src/shared/roles.js  -> SUPER_ADMIN_UIDS`);
console.log(`  firestore.rules      -> superAdmins()`);
console.log(`  ['${results[0].uid}', '${results[1].uid}']\n`);
process.exit(0);
```

- [ ] **Step 3: Run it**

Run: `node scripts/bootstrap.mjs`
Expected: two accounts created, `/settings/app` seeded, two UIDs and two temporary
passwords printed. Record the passwords — they are shown once and never stored.

- [ ] **Step 4: Substitute the UIDs in both files**

Replace `REPLACE_WITH_YASH_UID` and `REPLACE_WITH_TITUS_UID` in **both**
`src/shared/roles.js` and `firestore.rules` with the printed values. The two lists must
match exactly; the registry test in Task 7 fails if a placeholder survives.

- [ ] **Step 5: Run the full suite**

Run: `npm test && npm run test:rules`
Expected: PASS everywhere, including the three registry assertions from Task 7 that were
deliberately failing.

- [ ] **Step 6: Move the key to Vercel and delete the local copy**

```bash
base64 -i serviceAccount.json | pbcopy
```

Paste the clipboard into the Vercel dashboard as the environment variable
`FIREBASE_SERVICE_ACCOUNT`, scoped to all environments. Then:

```bash
rm serviceAccount.json
git status --short   # must not list serviceAccount.json
```

- [ ] **Step 7: Deploy the rules**

Run: `npx firebase deploy --only firestore:rules,firestore:indexes`
Expected: "Deploy complete".

- [ ] **Step 8: Commit**

```bash
git add scripts/bootstrap.mjs src/shared/roles.js firestore.rules
git commit -m "feat: bootstrap the two immutable super-admins and seed settings"
```

---

### Task 12: Design tokens and shadcn primitives

**Files:**
- Modify: `src/index.css`
- Modify: `vite.config.js` (path alias)
- Create: `jsconfig.json`
- Create: `components.json` (written by the shadcn CLI)
- Create: `src/components/ui/*` (generated)
- Create: `tests/tokens.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind theme tokens (`bg-primary`, `text-muted`, `rounded-card`,
  `shadow-card`, `font-display`) and shadcn `Button`, `Input`, `Label`, `Dialog`,
  `Table`, `Badge`, `Sonner` toaster under `src/components/ui/`.

- [ ] **Step 1: Add the path alias**

`vite.config.js` — add to the existing `defineConfig` object:

```js
import path from "node:path";
// inside defineConfig({ ... })
resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
```

`jsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

- [ ] **Step 2: Write the theme into `src/index.css`**

Tailwind v4 reads `@theme`, so every token becomes a utility. No component may hardcode
a hex value; the old inline `PALETTE` object is deleted in Plan 2 when `App.jsx` is
replaced.

```css
@import "tailwindcss";

@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap");

@theme {
  --color-ink: #0A0A0B;
  --color-muted: #6B7280;
  --color-line: #E8EAEE;
  --color-surface: #F7F8FA;

  --color-primary: #2D68FE;
  --color-primary-hover: #1D4FD8;

  --color-peach: #FFE9DC;
  --color-sky: #DCEBFF;
  --color-mint: #DFF3E6;
  --color-lilac: #ECE4FF;
  --color-blush: #FFE1EC;
  --color-cream: #FFF3D6;

  --color-success: #12805C;
  --color-danger: #DC2626;
  --color-warn: #B45309;

  --radius-card: 16px;
  --shadow-card: 0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px -8px rgba(16, 24, 40, 0.10);

  --font-display: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}

@layer base {
  html { -webkit-font-smoothing: antialiased; }
  body { background: white; color: var(--color-ink); font-family: var(--font-sans); }
  h1, h2, h3 { font-family: var(--font-display); letter-spacing: -0.02em; }
  /* Every figure in this app is money; align the columns. */
  .tabular { font-variant-numeric: tabular-nums; }
  /* Clarity constraint: interactive targets are never smaller than 44px. */
  button, [role="button"], a.btn, input, select { min-height: 44px; }
}
```

- [ ] **Step 3: Install the shadcn primitives**

Run `npx shadcn@latest init` and accept the defaults it infers from `components.json`.
Then pull the components this plan needs. Prefer the shadcn MCP where available rather
than hand-writing any of these:

```bash
npx shadcn@latest add button input label dialog table badge sonner dropdown-menu
```

- [ ] **Step 4: Write the token test**

```js
// tests/tokens.test.js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/index.css", "utf8");

describe("design tokens", () => {
  it("defines every colour the spec names", () => {
    for (const token of [
      "--color-ink", "--color-muted", "--color-line", "--color-surface",
      "--color-primary", "--color-primary-hover",
      "--color-peach", "--color-sky", "--color-mint",
      "--color-lilac", "--color-blush", "--color-cream",
      "--color-success", "--color-danger", "--color-warn",
    ]) {
      expect(css).toContain(token);
    }
  });
  it("pins the Hire3x primary blue", () => {
    expect(css).toMatch(/--color-primary:\s*#2D68FE/i);
  });
  it("enforces the 44px minimum touch target", () => {
    expect(css).toMatch(/min-height:\s*44px/);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- tokens`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/index.css vite.config.js jsconfig.json components.json src/components/ui tests/tokens.test.js
git commit -m "feat: add Hire3x design tokens and shadcn UI primitives"
```

---

### Task 13: Auth provider and route guard

**Files:**
- Create: `src/auth/AuthProvider.jsx`
- Create: `src/auth/RequireAuth.jsx`
- Create: `tests/auth-provider.test.jsx`

**Interfaces:**
- Consumes: `auth`, `db`, `effectiveRole`, `fromAuthEmail`.
- Produces:
  - `<AuthProvider>` — subscribes to `onAuthStateChanged` and to the caller's `/users`
    document, so a role change or a disable takes effect without a reload.
  - `useAuth() => { status, user, profile, role, username, isAdmin, isSuper, signOut }`
    where `status` is `"loading" | "signedOut" | "needsPasswordChange" | "ready"`.
  - `<RequireAuth adminOnly>` — route guard.

- [ ] **Step 1: Write the failing test**

```jsx
// tests/auth-provider.test.jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

let authCallback;
let profileCallback;

vi.mock("../src/lib/firebase.js", () => ({
  auth: {},
  db: {},
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_a, cb) => { authCallback = cb; return () => {}; },
  signOut: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  doc: () => ({}),
  onSnapshot: (_ref, cb) => { profileCallback = cb; return () => {}; },
}));
vi.mock("../src/shared/roles.js", () => ({
  effectiveRole: (uid, stored) => (uid === "uid_super" ? "superadmin" : stored ?? "member"),
}));

const { AuthProvider, useAuth } = await import("../src/auth/AuthProvider.jsx");

function Probe() {
  const { status, role, username } = useAuth();
  return <div>{status}|{role}|{username}</div>;
}
const renderProbe = () => render(<AuthProvider><Probe /></AuthProvider>);
const emitProfile = (data) => profileCallback({ exists: () => !!data, data: () => data });

describe("AuthProvider", () => {
  beforeEach(() => { authCallback = null; profileCallback = null; });

  it("starts in the loading state so no screen flashes before the session is known", () => {
    renderProbe();
    expect(screen.getByText(/^loading\|/)).toBeInTheDocument();
  });

  it("reports signedOut when there is no session", async () => {
    renderProbe();
    authCallback(null);
    await waitFor(() => expect(screen.getByText(/^signedOut\|/)).toBeInTheDocument());
  });

  it("reports needsPasswordChange ahead of ready, so the gate cannot be skipped", async () => {
    renderProbe();
    authCallback({ uid: "uid_m", email: "shijin@team.hire3x.com" });
    emitProfile({ username: "shijin", role: "member", mustChangePassword: true, disabled: false });
    await waitFor(() =>
      expect(screen.getByText(/^needsPasswordChange\|/)).toBeInTheDocument());
  });

  it("reports ready with the resolved role once the flag is cleared", async () => {
    renderProbe();
    authCallback({ uid: "uid_m", email: "shijin@team.hire3x.com" });
    emitProfile({ username: "shijin", role: "member", mustChangePassword: false, disabled: false });
    await waitFor(() =>
      expect(screen.getByText("ready|member|shijin")).toBeInTheDocument());
  });

  it("overrides a stored role for a listed super-admin", async () => {
    renderProbe();
    authCallback({ uid: "uid_super", email: "yash@team.hire3x.com" });
    emitProfile({ username: "yash", role: "member", mustChangePassword: false, disabled: false });
    await waitFor(() =>
      expect(screen.getByText("ready|superadmin|yash")).toBeInTheDocument());
  });

  it("signs a user out the moment their profile is disabled", async () => {
    const { signOut } = await import("firebase/auth");
    renderProbe();
    authCallback({ uid: "uid_m", email: "shijin@team.hire3x.com" });
    emitProfile({ username: "shijin", role: "member", mustChangePassword: false, disabled: true });
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("signs a user out when they have no profile document at all", async () => {
    const { signOut } = await import("firebase/auth");
    renderProbe();
    authCallback({ uid: "uid_ghost", email: "ghost@team.hire3x.com" });
    emitProfile(null);
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- auth-provider`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/auth/AuthProvider.jsx`**

```jsx
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../lib/firebase.js";
import { effectiveRole } from "../shared/roles.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => onAuthStateChanged(auth, (next) => {
    setUser(next);
    if (!next) {
      setProfile(null);
      setStatus("signedOut");
    } else {
      setStatus("loading");
    }
  }), []);

  useEffect(() => {
    if (!user) return undefined;
    // Live subscription, not a one-off read: a disable or role change lands immediately.
    return onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) {
          fbSignOut(auth);
          return;
        }
        const data = snap.data();
        if (data.disabled === true) {
          fbSignOut(auth);
          return;
        }
        setProfile(data);
        setStatus(data.mustChangePassword ? "needsPasswordChange" : "ready");
      },
      () => fbSignOut(auth)
    );
  }, [user]);

  const signOut = useCallback(() => fbSignOut(auth), []);

  const role = user ? effectiveRole(user.uid, profile?.role) : null;
  const value = {
    status,
    user,
    profile,
    role,
    username: profile?.username ?? null,
    isAdmin: role === "admin" || role === "superadmin",
    isSuper: role === "superadmin",
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
```

- [ ] **Step 4: Implement `src/auth/RequireAuth.jsx`**

```jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider.jsx";

export default function RequireAuth({ children, adminOnly = false }) {
  const { status, isAdmin } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center text-muted" role="status">
        Loading…
      </div>
    );
  }
  if (status === "signedOut") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  // Checked before anything else renders, so no route can be reached around it.
  if (status === "needsPasswordChange") {
    return <Navigate to="/change-password" replace />;
  }
  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- auth-provider`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/auth/AuthProvider.jsx src/auth/RequireAuth.jsx tests/auth-provider.test.jsx
git commit -m "feat: add the auth provider and route guard"
```

---

### Task 14: Login and change-password screens

**Files:**
- Create: `src/auth/LoginPage.jsx`
- Create: `src/auth/ChangePasswordPage.jsx`
- Create: `tests/login-page.test.jsx`

**Interfaces:**
- Consumes: `toAuthEmail`, `validateUsername`, `validatePassword`, `callApi`, `useAuth`.
- Produces: two routed screens. Neither renders an `@` or the word "email".

- [ ] **Step 1: Write the failing test**

```jsx
// tests/login-page.test.jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const signInWithEmailAndPassword = vi.fn();
vi.mock("../src/lib/firebase.js", () => ({ auth: {}, db: {} }));
vi.mock("firebase/auth", () => ({ signInWithEmailAndPassword }));

const { default: LoginPage } = await import("../src/auth/LoginPage.jsx");
const renderPage = () => render(<MemoryRouter><LoginPage /></MemoryRouter>);

describe("LoginPage", () => {
  beforeEach(() => signInWithEmailAndPassword.mockReset());

  it("asks for a username, never an email address", () => {
    renderPage();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/e-?mail/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/@/);
  });

  it("appends the synthetic domain before calling Firebase", async () => {
    signInWithEmailAndPassword.mockResolvedValue({});
    renderPage();
    await userEvent.type(screen.getByLabelText(/username/i), "shijin");
    await userEvent.type(screen.getByLabelText(/password/i), "Marketing-2026x");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      {}, "shijin@team.hire3x.com", "Marketing-2026x"
    );
  });

  it("rejects an invalid username before making a network call", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/username/i), "ya sh");
    await userEvent.type(screen.getByLabelText(/password/i), "Marketing-2026x");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows one plain message for wrong credentials, not a Firebase error code", async () => {
    signInWithEmailAndPassword.mockRejectedValue({ code: "auth/invalid-credential" });
    renderPage();
    await userEvent.type(screen.getByLabelText(/username/i), "shijin");
    await userEvent.type(screen.getByLabelText(/password/i), "wrongpass123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/username or password/i);
    expect(alert.textContent).not.toMatch(/auth\//);
  });

  it("tells the user who to ask instead of offering a reset link", () => {
    renderPage();
    expect(screen.getByText(/yash or titus/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- login-page`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/auth/LoginPage.jsx`**

```jsx
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase.js";
import { toAuthEmail, validateUsername } from "../lib/username.js";

// Firebase error codes are never shown to the user; each maps to one plain sentence.
const MESSAGES = {
  "auth/invalid-credential": "That username or password is not right.",
  "auth/wrong-password": "That username or password is not right.",
  "auth/user-not-found": "That username or password is not right.",
  "auth/user-disabled": "This account has been switched off. Ask Yash or Titus.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/network-request-failed": "No connection. Check your internet and try again.",
};

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");

    const check = validateUsername(username);
    if (!check.ok) return setError(check.reason);
    if (!password) return setError("Enter your password.");

    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, toAuthEmail(username), password);
    } catch (err) {
      setError(MESSAGES[err?.code] ?? "Could not sign in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-surface px-4">
      <div className="w-full max-w-sm bg-white rounded-card shadow-card p-8">
        <h1 className="text-2xl font-extrabold mb-1">Budget tracker</h1>
        <p className="text-muted text-sm mb-6">Hire3x Marketing</p>

        <form onSubmit={submit} noValidate>
          <label htmlFor="username" className="block text-sm font-semibold mb-1">
            Username
          </label>
          <input
            id="username"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            className="w-full rounded-full border border-line px-4 mb-4"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label htmlFor="password" className="block text-sm font-semibold mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="w-full rounded-full border border-line px-4 mb-5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p role="alert" className="text-danger text-sm mb-4">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-primary text-white font-semibold hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-muted text-xs mt-6 text-center">
          Forgot your password? Ask Yash or Titus to set a new one for you.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `src/auth/ChangePasswordPage.jsx`**

```jsx
import { useState } from "react";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider.jsx";
import { validatePassword } from "../lib/password.js";
import { callApi } from "../lib/api.js";

export default function ChangePasswordPage() {
  const { user, username, status, signOut } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const forced = status === "needsPasswordChange";

  async function submit(event) {
    event.preventDefault();
    setError("");

    const check = validatePassword(next);
    if (!check.ok) return setError(check.reason);
    if (next !== confirm) return setError("The two new passwords do not match.");
    if (next === current) return setError("Choose a password you have not used here before.");

    setBusy(true);
    try {
      // Firebase requires a recent sign-in before a password change.
      await reauthenticateWithCredential(
        user, EmailAuthProvider.credential(user.email, current)
      );
      await updatePassword(user, next);
      await callApi("users/clear-must-change");
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err?.code === "auth/invalid-credential" || err?.code === "auth/wrong-password"
          ? "Your current password is not right."
          : err?.message ?? "Could not change the password. Try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-surface px-4">
      <div className="w-full max-w-sm bg-white rounded-card shadow-card p-8">
        <h1 className="text-2xl font-extrabold mb-1">
          {forced ? "Set your own password" : "Change password"}
        </h1>
        <p className="text-muted text-sm mb-6">
          {forced
            ? `Welcome, @${username}. Replace the temporary password you were given.`
            : "Pick something only you know."}
        </p>

        <form onSubmit={submit} noValidate>
          <Field id="current" label={forced ? "Temporary password" : "Current password"}
                 value={current} onChange={setCurrent} autoComplete="current-password" />
          <Field id="next" label="New password" value={next} onChange={setNext}
                 autoComplete="new-password" hint="At least 10 characters, with a number." />
          <Field id="confirm" label="New password again" value={confirm} onChange={setConfirm}
                 autoComplete="new-password" />

          {error && <p role="alert" className="text-danger text-sm mb-4">{error}</p>}

          <button type="submit" disabled={busy}
                  className="w-full rounded-full bg-primary text-white font-semibold hover:bg-primary-hover disabled:opacity-60">
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>

        {forced && (
          <button onClick={signOut} className="w-full text-muted text-xs mt-4">
            Sign out instead
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, autoComplete, hint }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-semibold mb-1">{label}</label>
      <input id={id} type="password" autoComplete={autoComplete} value={value}
             onChange={(e) => onChange(e.target.value)}
             className="w-full rounded-full border border-line px-4" />
      {hint && <p className="text-muted text-xs mt-1">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- login-page`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/auth/LoginPage.jsx src/auth/ChangePasswordPage.jsx tests/login-page.test.jsx
git commit -m "feat: add the username sign-in and password-change screens"
```

---

### Task 15: Application shell and routing

**Files:**
- Modify: `src/main.jsx`
- Replace: `src/App.jsx`
- Create: `src/components/AppShell.jsx`
- Create: `src/features/dashboard/DashboardPlaceholder.jsx`

**Interfaces:**
- Consumes: `AuthProvider`, `RequireAuth`, `useAuth`, the shadcn primitives.
- Produces: routes `/login`, `/change-password`, `/`, `/team`; `<AppShell>` wrapping the
  authenticated routes.

The existing 1,065-line `src/App.jsx` is replaced by a router. Its tracker UI is rebuilt
in Plan 2 — copy nothing forward; the old file stays in git history.

- [ ] **Step 1: Replace `src/App.jsx`**

```jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import RequireAuth from "./auth/RequireAuth.jsx";
import LoginPage from "./auth/LoginPage.jsx";
import ChangePasswordPage from "./auth/ChangePasswordPage.jsx";
import AppShell from "./components/AppShell.jsx";
import DashboardPlaceholder from "./features/dashboard/DashboardPlaceholder.jsx";
import TeamPage from "./features/admin/TeamPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route path="/" element={<DashboardPlaceholder />} />
          </Route>
          <Route
            path="/team"
            element={<RequireAuth adminOnly><AppShell><TeamPage /></AppShell></RequireAuth>}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="bottom-center" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Implement `src/components/AppShell.jsx`**

Navigation never exceeds four items, and Team is hidden — not disabled — for members.
Settings and Reports arrive in Plans 2 and 3; the array is where they slot in.

```jsx
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.jsx";

export default function AppShell({ children }) {
  const { username, role, isAdmin, signOut } = useAuth();

  const links = [
    { to: "/", label: "Dashboard", show: true },
    { to: "/team", label: "Team", show: isAdmin },
  ].filter((l) => l.show);

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-line">
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-6 h-16">
          <span className="font-display font-extrabold text-lg">Budget tracker</span>

          <nav className="flex gap-1 flex-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  `px-4 grid place-items-center rounded-full text-sm font-semibold ${
                    isActive ? "bg-sky text-primary" : "text-muted hover:text-ink"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted hidden sm:inline">
              @{username}{role !== "member" ? ` · ${role}` : ""}
            </span>
            <button onClick={signOut} className="text-sm font-semibold px-4 rounded-full border border-line">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">{children ?? <Outlet />}</main>
    </div>
  );
}
```

- [ ] **Step 3: Implement `src/features/dashboard/DashboardPlaceholder.jsx`**

An honest placeholder, not a fake dashboard. Plan 2 replaces it.

```jsx
export default function DashboardPlaceholder() {
  return (
    <div className="bg-white rounded-card shadow-card p-10 text-center">
      <h1 className="text-xl font-extrabold mb-2">You are signed in</h1>
      <p className="text-muted text-sm">
        The budget tracker itself lands in the next stage. Admins can already add
        teammates from the Team tab.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Verify `src/main.jsx` is unchanged and still renders `<App />`**

Run: `npm run dev`, open the printed URL.
Expected: redirected to `/login`, the sign-in card renders with the Hire3x tokens.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/AppShell.jsx src/features/dashboard/
git commit -m "feat: replace the monolithic App with a router and application shell"
```

---

### Task 16: Team page

**Files:**
- Create: `src/features/admin/TeamPage.jsx`
- Create: `src/features/admin/AddTeammateDialog.jsx`
- Create: `src/features/admin/useTeam.js`
- Create: `tests/add-teammate.test.jsx`

**Interfaces:**
- Consumes: `callApi`, `useAuth`, `generateTempPassword`, `validateUsername`, `canActOn`.
- Produces: the admin surface — roster, add teammate, reset password, change role,
  disable — plus a copyable handover message.

- [ ] **Step 1: Write the failing test**

```jsx
// tests/add-teammate.test.jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const callApi = vi.fn();
vi.mock("../src/lib/api.js", () => ({ callApi }));
vi.mock("../src/lib/firebase.js", () => ({ auth: {}, db: {} }));

const { default: AddTeammateDialog } = await import("../src/features/admin/AddTeammateDialog.jsx");
const renderDialog = (props = {}) =>
  render(<AddTeammateDialog open onClose={() => {}} canAssignRoles={false} {...props} />);

describe("AddTeammateDialog", () => {
  beforeEach(() => callApi.mockReset());

  it("prefills a strong temporary password so an admin never invents a weak one", () => {
    renderDialog();
    expect(screen.getByLabelText(/temporary password/i).value.length).toBeGreaterThanOrEqual(10);
  });

  it("blocks an invalid username before calling the API", async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/username/i), "Ya Sh");
    await userEvent.type(screen.getByLabelText(/full name/i), "Yash");
    await userEvent.click(screen.getByRole("button", { name: /add teammate/i }));
    expect(callApi).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("hides the role selector from an admin who cannot assign roles", () => {
    renderDialog({ canAssignRoles: false });
    expect(screen.queryByLabelText(/role/i)).toBeNull();
  });

  it("shows the role selector to a super-admin", () => {
    renderDialog({ canAssignRoles: true });
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
  });

  it("posts to the create route and then shows a copyable handover message", async () => {
    callApi.mockResolvedValue({ uid: "u1", username: "shijin" });
    renderDialog();
    await userEvent.clear(screen.getByLabelText(/temporary password/i));
    await userEvent.type(screen.getByLabelText(/temporary password/i), "Marketing-2026x");
    await userEvent.type(screen.getByLabelText(/username/i), "shijin");
    await userEvent.type(screen.getByLabelText(/full name/i), "Shijin");
    await userEvent.click(screen.getByRole("button", { name: /add teammate/i }));

    expect(callApi).toHaveBeenCalledWith("users/create", {
      username: "shijin",
      displayName: "Shijin",
      tempPassword: "Marketing-2026x",
      role: "member",
    });
    const handover = await screen.findByTestId("handover");
    expect(handover.textContent).toContain("shijin");
    expect(handover.textContent).toContain("Marketing-2026x");
  });

  it("surfaces a taken username as the server's own message", async () => {
    callApi.mockRejectedValue(new Error('The username "shijin" is already taken.'));
    renderDialog();
    await userEvent.type(screen.getByLabelText(/username/i), "shijin");
    await userEvent.type(screen.getByLabelText(/full name/i), "Shijin");
    await userEvent.click(screen.getByRole("button", { name: /add teammate/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already taken/i);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- add-teammate`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/features/admin/AddTeammateDialog.jsx`**

```jsx
import { useState } from "react";
import { validateUsername } from "../../lib/username.js";
import { generateTempPassword, validatePassword } from "../../lib/password.js";
import { callApi } from "../../lib/api.js";

export default function AddTeammateDialog({ open, onClose, canAssignRoles, onCreated }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tempPassword, setTempPassword] = useState(() => generateTempPassword());
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  if (!open) return null;

  async function submit(event) {
    event.preventDefault();
    setError("");

    const name = validateUsername(username.trim().toLowerCase());
    if (!name.ok) return setError(name.reason);
    if (!displayName.trim()) return setError("Enter their full name.");
    const pw = validatePassword(tempPassword);
    if (!pw.ok) return setError(pw.reason);

    setBusy(true);
    try {
      await callApi("users/create", {
        username: username.trim().toLowerCase(),
        displayName: displayName.trim(),
        tempPassword,
        role,
      });
      setCreated({ username: username.trim().toLowerCase(), tempPassword });
      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const message =
      `You're set up on the Hire3x budget tracker.\n` +
      `Username: ${created.username}\n` +
      `Temporary password: ${created.tempPassword}\n` +
      `You'll be asked to pick your own password when you sign in.`;
    return (
      <Panel title={`@${created.username} is ready`} onClose={onClose}>
        <p className="text-muted text-sm mb-3">Send them this message.</p>
        <pre data-testid="handover"
             className="bg-surface rounded-card p-4 text-sm whitespace-pre-wrap mb-4">
          {message}
        </pre>
        <button onClick={() => navigator.clipboard?.writeText(message)}
                className="w-full rounded-full bg-primary text-white font-semibold mb-2">
          Copy message
        </button>
        <button onClick={onClose} className="w-full rounded-full border border-line font-semibold">
          Done
        </button>
      </Panel>
    );
  }

  return (
    <Panel title="Add a teammate" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Text id="username" label="Username" value={username} onChange={setUsername}
              hint="Lowercase, no spaces. This is what they type to sign in." />
        <Text id="displayName" label="Full name" value={displayName} onChange={setDisplayName} />

        <div className="mb-4">
          <label htmlFor="tempPassword" className="block text-sm font-semibold mb-1">
            Temporary password
          </label>
          <div className="flex gap-2">
            <input id="tempPassword" value={tempPassword}
                   onChange={(e) => setTempPassword(e.target.value)}
                   className="flex-1 rounded-full border border-line px-4" />
            <button type="button" onClick={() => setTempPassword(generateTempPassword())}
                    className="px-4 rounded-full border border-line text-sm font-semibold">
              Generate
            </button>
          </div>
          <p className="text-muted text-xs mt-1">They must change this on first sign-in.</p>
        </div>

        {canAssignRoles && (
          <div className="mb-4">
            <label htmlFor="role" className="block text-sm font-semibold mb-1">Role</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-full border border-line px-4">
              <option value="member">Member — logs expenses</option>
              <option value="admin">Admin — also sets budgets and adds people</option>
            </select>
          </div>
        )}

        {error && <p role="alert" className="text-danger text-sm mb-4">{error}</p>}

        <button type="submit" disabled={busy}
                className="w-full rounded-full bg-primary text-white font-semibold disabled:opacity-60">
          {busy ? "Adding…" : "Add teammate"}
        </button>
      </form>
    </Panel>
  );
}

function Panel({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-ink/40 grid place-items-center p-4 z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-card shadow-card p-6 w-full max-w-md">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted px-2">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Text({ id, label, value, onChange, hint }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-semibold mb-1">{label}</label>
      <input id={id} value={value} autoCapitalize="none" autoCorrect="off"
             onChange={(e) => onChange(e.target.value)}
             className="w-full rounded-full border border-line px-4" />
      {hint && <p className="text-muted text-xs mt-1">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Implement `src/features/admin/useTeam.js`**

```js
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../lib/firebase.js";

export function useTeam() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() =>
    onSnapshot(
      query(collection(db, "users"), orderBy("username")),
      (snap) => {
        setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); }
    ), []);

  return { members, loading, error };
}
```

- [ ] **Step 5: Implement `src/features/admin/TeamPage.jsx`**

Every action a viewer cannot take is hidden, not disabled — a member never sees a
greyed-out "Make admin". Super-admins render with a lock and no action menu at all,
which makes the immutability visible rather than only enforced.

```jsx
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { callApi } from "../../lib/api.js";
import { canActOn, canAssignRoles, isSuperAdmin } from "../../shared/roles.js";
import { generateTempPassword } from "../../lib/password.js";
import { useTeam } from "./useTeam.js";
import AddTeammateDialog from "./AddTeammateDialog.jsx";

const ROLE_LABEL = { superadmin: "Owner", admin: "Admin", member: "Member" };

export default function TeamPage() {
  const { user, role } = useAuth();
  const { members, loading, error } = useTeam();
  const [adding, setAdding] = useState(false);
  const [busyUid, setBusyUid] = useState(null);

  async function run(uid, label, fn) {
    setBusyUid(uid);
    try {
      await fn();
      toast.success(label);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyUid(null);
    }
  }

  const resetPassword = (m) => {
    const tempPassword = generateTempPassword();
    return run(m.uid, "Password reset", async () => {
      await callApi("users/reset-password", { uid: m.uid, tempPassword });
      await navigator.clipboard?.writeText(
        `Your budget tracker password was reset.\nUsername: ${m.username}\nTemporary password: ${tempPassword}`
      );
      toast.info("Handover message copied to your clipboard.");
    });
  };

  if (loading) return <p className="text-muted">Loading the team…</p>;
  if (error) return <p role="alert" className="text-danger">{error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">Team</h1>
          <p className="text-muted text-sm">{members.length} people can use the tracker.</p>
        </div>
        <button onClick={() => setAdding(true)}
                className="rounded-full bg-primary text-white font-semibold px-5">
          Add teammate
        </button>
      </div>

      <div className="bg-white rounded-card shadow-card divide-y divide-line">
        {members.map((m) => {
          const locked = isSuperAdmin(m.uid);
          const actionable = canActOn({
            actorUid: user.uid, actorRole: role, targetUid: m.uid, targetRole: m.role,
          });
          return (
            <div key={m.uid} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="font-semibold">
                  {m.displayName}{" "}
                  <span className="text-muted font-normal">@{m.username}</span>
                </div>
                <div className="text-muted text-xs mt-0.5">
                  {ROLE_LABEL[m.role] ?? "Member"}
                  {locked && " · permanent, cannot be removed"}
                  {m.disabled && " · switched off"}
                  {m.mustChangePassword && " · has not set their own password yet"}
                </div>
              </div>

              {actionable && (
                <div className="flex gap-2 shrink-0">
                  <button disabled={busyUid === m.uid} onClick={() => resetPassword(m)}
                          className="text-sm font-semibold px-4 rounded-full border border-line">
                    Reset password
                  </button>
                  {canAssignRoles(role) && (
                    <button disabled={busyUid === m.uid}
                            onClick={() => run(m.uid, "Role updated", () =>
                              callApi("users/set-role", {
                                uid: m.uid, role: m.role === "admin" ? "member" : "admin",
                              }))}
                            className="text-sm font-semibold px-4 rounded-full border border-line">
                      {m.role === "admin" ? "Make member" : "Make admin"}
                    </button>
                  )}
                  <button disabled={busyUid === m.uid}
                          onClick={() => run(m.uid, m.disabled ? "Re-enabled" : "Switched off", () =>
                            callApi("users/set-disabled", { uid: m.uid, disabled: !m.disabled }))}
                          className="text-sm font-semibold px-4 rounded-full border border-line text-danger">
                    {m.disabled ? "Turn back on" : "Switch off"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AddTeammateDialog open={adding} onClose={() => setAdding(false)}
                         canAssignRoles={canAssignRoles(role)} />
    </div>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS across every suite.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/ tests/add-teammate.test.jsx
git commit -m "feat: add the Team page with user creation, reset, role, and disable"
```

---

### Task 17: Local verification, team accounts, and deploy

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a running local app, five real accounts with credentials to hand over, and a
  live Vercel deployment.

- [ ] **Step 1: Run every check**

```bash
npm test
npm run test:rules
npx tsc --noEmit
npm run build
```

Expected: four clean runs. Do not proceed past a failure — record the output instead.

- [ ] **Step 2: Start the app against the real project**

Run: `npm run dev`

Sign in as `yash` with the temporary password printed by Task 11. Expected: redirected
to `/change-password` before anything else renders.

- [ ] **Step 3: Verify the gate cannot be walked around**

While still holding the forced-change state, type `/team` into the address bar.
Expected: bounced straight back to `/change-password`.

Set a new password. Expected: landed on `/`, with **Dashboard** and **Team** in the nav.

- [ ] **Step 4: Create the remaining three accounts**

From **Team → Add teammate**, create `titus` if the bootstrap did not, then `gebin`,
`shijin`, and `madesh`. Use the **Generate** button for each temporary password and copy
the handover message it produces.

Record every credential in one place for handover:

| Username | Name | Role | Temporary password |
| --- | --- | --- | --- |
| yash | Yash | Owner | *(from bootstrap)* |
| titus | Titus | Owner | *(from bootstrap)* |
| gebin | Gebin | Admin | *(from Generate)* |
| shijin | Shijin | Member | *(from Generate)* |
| madesh | Madesh | Member | *(from Generate)* |

- [ ] **Step 5: Verify the permission matrix by hand**

| Check | Expected |
| --- | --- |
| Sign in as `madesh` | No **Team** tab in the nav |
| Visit `/team` directly as `madesh` | Redirected to `/` |
| As `gebin` (admin), open Team | No action buttons on Yash's or Titus's rows |
| As `gebin`, try to make someone an admin | No "Make admin" button is rendered |
| As `yash`, promote `gebin` to admin | Succeeds; `gebin`'s next page load reflects it |
| Switch off `madesh`, then reload his session | Signed out immediately |

- [ ] **Step 6: Confirm the service-account key is not in the repository**

```bash
git log --all --diff-filter=A --name-only | grep -i serviceaccount && echo "LEAKED" || echo "clean"
```

Expected: `clean`. If it prints `LEAKED`, rotate the key in the Firebase console before
going further.

- [ ] **Step 7: Deploy**

Confirm the six `VITE_FIREBASE_*` values and `FIREBASE_SERVICE_ACCOUNT` are set in the
Vercel dashboard, then:

```bash
npx vercel --prod
```

Open the printed URL. Sign in. Expected: identical behaviour to local, and
`/api/users/create` returning JSON rather than HTML — if it returns HTML, the
`vercel.json` rewrite is missing its `(?!api/)` exclusion.

- [ ] **Step 8: Update `README.md`**

Replace the Vercel-and-localStorage instructions with: local setup, the emulator
commands, the three test commands, the environment variables, and a note that
`scripts/bootstrap.mjs` is run once per project and never again.

- [ ] **Step 9: Commit and push**

```bash
git branch --show-current   # must print gebin-Dev
git add README.md
git commit -m "docs: document local setup, emulators, and deployment"
git push
```
