# Hire3x Marketing Budget Tracker — Firebase Migration & Revamp

**Date:** 2026-08-31
**Status:** Approved
**Supersedes:** the localStorage-only single-file application on `main`
**Revision:** 2026-08-31 — hosting moved from Firebase Hosting to Vercel; Cloud
Functions replaced by Vercel Serverless Functions; receipt attachments dropped so the
system runs entirely on free tiers.

---

## 1. Problem

The tracker today is a single 1,065-line `src/App.jsx` persisting one JSON blob to
`localStorage`. It works for exactly one person on exactly one device. The marketing
team needs five people editing the same budget concurrently, with sign-in, roles,
an audit trail, and reports they can hand to finance.

A naive port of the current design to Firestore would make things worse, not better:
the whole application state is written as one document on every change, so two
people saving at the same time would silently destroy each other's expenses.

## 2. Goals

1. Five named users sign in with a **username and password**; no anonymous or Google auth.
2. Concurrent editing is safe — no write can clobber another user's work.
3. Two permanent super-admins (Yash, Titus) who cannot be demoted or removed by anyone.
4. Delegated admins who can onboard users but cannot touch other admins.
5. Visual language matched to the Hire3x product.
6. The UI is legible to a non-technical user on first contact ("granny-tested").
7. Every failure point catalogued in §10 is fixed and covered by a test.

## 3. Non-goals

- Multi-tenancy or multiple organisations.
- Mobile native apps. The web app is responsive; that is the whole mobile story.
- Approval workflows, purchase orders, or accounting-system integration.
- Historical data beyond what the configured period covers.

---

## 4. Architecture

### 4.1 Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Build | Vite 6 | kept |
| UI | React 18, React Router 6 | Router is new; four routes plus auth screens |
| Styling | Tailwind CSS v4 | kept; design tokens defined in `@theme` |
| Components | shadcn/ui primitives | sourced via the shadcn MCP, not hand-rolled |
| Auth | Firebase Auth (Email/Password provider) | driven by synthetic addresses, see §6 |
| Database | Cloud Firestore | one document per expense |
| Server | Vercel Serverless Functions, Node 20, TypeScript | privileged operations only |
| Hosting | Vercel | the project already deploys there |
| Tests | Vitest, Testing Library, `@firebase/rules-unit-testing` | rules tested against the emulator |

**The entire system runs on free tiers.** Firebase stays on the **Spark** plan —
Auth and Firestore only, no Cloud Functions and no Cloud Storage, so no payment
method is required. The privileged backend is a set of Vercel Serverless Functions on
the **Hobby** plan. Neither vendor requires a card.

The one real secret in the system is the Firebase service-account key used by the
backend. It is stored as a Vercel environment variable, never committed, and never
shipped to the browser.

### 4.2 The central decision — document granularity

**Each expense is its own Firestore document.** Two users adding expenses write to
different document paths and therefore cannot conflict. Firestore's local write queue
provides optimistic UI and offline tolerance without any custom layer.

Two users editing *the same* expense remains last-write-wins. This is accepted: the
window is seconds, and the audit trail (§5.5) records both writes so the loss is
always visible and recoverable.

### 4.3 Module layout

`src/App.jsx` is decomposed. No file exceeds roughly 250 lines.

```
src/
  main.jsx
  App.jsx                    router shell only
  lib/
    firebase.js              SDK init; exports auth and db
    format.js                inr(), fmtDate(), escapeHtml(), parseAmount()
    period.js                month list derived from settings; no hardcoded dates
    quickAdd.js              natural-language expense parser (pure, unit-tested)
    csv.js                   import parse + export serialise
    api.js                   authenticated fetch wrapper for the /api routes
    pdf.js                   pdfmake document definition for the monthly report
  auth/
    AuthProvider.jsx         onAuthStateChanged + profile doc + custom claims
    RequireAuth.jsx          route guard; redirects on mustChangePassword
    LoginPage.jsx
    ChangePasswordPage.jsx
  data/
    useSettings.js           period, categories
    useExpenses.js           onSnapshot for active month; create/update/remove
    useBudgets.js
    useUsers.js              admin-only user list
    usePresence.js           heartbeat + who-is-here
  shared/
    roles.js                 super-admin UID registry; imported by client AND api
  features/
    dashboard/               month strip, totals, pacing, category breakdown
    expenses/                quick-add bar, list, inline edit, undo
    reports/                 report preview, PDF export, CSV in/out
    admin/                   team management
    settings/                period, categories
api/
  _lib/                      admin SDK init, ID-token verification, role guards
  users/                     create, reset-password, set-role, set-disabled, clear-must-change
  components/
    ui/                      shadcn primitives
    CommandPalette.jsx
    Toaster.jsx
```

---

## 5. Data model

### 5.1 `/settings/app` — single document

```
periodStart   "YYYY-MM"     inclusive
periodEnd     "YYYY-MM"     inclusive
categories    [{ id, label, color, recurring }]
currency      "INR"
updatedBy, updatedAt
```

`recurring: true` marks a category whose spend repeats monthly (SaaS, retainers);
§11.3's one-click repeat reads this flag.

Replaces the hardcoded `MONTHS` and `CATEGORIES` constants. The month list is derived
at runtime by `lib/period.js`. Editable by admins on the Settings page.

### 5.2 `/users/{uid}`

```
username           lowercase, unique, 3-20 chars
displayName
role               "superadmin" | "admin" | "member"
                   superadmin is set only by the bootstrap script (§8.1);
                   no function and no caller can assign it
contactEmail       optional; for reaching the person, never used for auth
mustChangePassword boolean
disabled           boolean
createdAt, createdBy, lastLoginAt
```

**No client may write to this collection.** Rules deny all client writes. Every field
is set by the backend API running the Admin SDK. This removes any possibility of
privilege escalation through a UI bug.

### 5.3 `/expenses/{expenseId}`

```
description   1-200 chars
amount        number > 0
date          "YYYY-MM-DD"
month         "YYYY-MM"   denormalised from date; the query key
category       string, must match a configured category id
invoice        optional string
notes          optional string, <= 1000 chars
createdBy, createdAt, updatedBy, updatedAt
```

`month` is denormalised so the dashboard query is
`where("month", "==", activeMonth)` — a single-field index, no composite index needed.

Document ids come from `crypto.randomUUID()`, replacing `"exp_" + Date.now()`.

### 5.4 `/budgets/{YYYY-MM}`

```
amount        number >= 0
updatedBy, updatedAt
```

Document id *is* the month key, which makes budget writes idempotent and
collision-free by construction.

### 5.5 `/audit/{auditId}`

```
at, by, byUsername
action      "expense.create" | "expense.update" | "expense.delete"
            | "budget.set" | "user.create" | "user.role" | "user.disable"
            | "user.passwordReset"
entityId, summary, before, after
```

Vercel cannot host Firestore triggers, so audit entries for expense and budget changes
are written by the client under rules that permit **`create` only** — no update, no
delete — with `by` forced to equal the caller's UID and `at` forced to the server
timestamp. Entries therefore cannot be altered or erased after the fact, and cannot be
attributed to someone else.

A signed-in user could still omit an entry. The tamper-resistant fallback is that every
expense document carries `updatedBy` and `updatedAt`, which the rules force to match the
caller on every write, so "who last touched this" survives a missing audit row. For a
five-person internal tool this is an accepted limit, recorded here so it is not mistaken
for a stronger guarantee than it is.

User-management actions are audited server-side by the backend, where the client has no
opportunity to skip them.

### 5.6 `/presence/{uid}`

```
username, activeMonth, lastSeen
```

Heartbeat every 30 seconds. Entries older than 90 seconds are treated as gone.

---

## 6. Authentication

### 6.1 Usernames over email

Firebase Auth has no username provider. Usernames are implemented by appending a
fixed domain before every SDK call:

```
USERNAME_DOMAIN = "team.hire3x.com"
signIn("yash", pw)  ->  signInWithEmailAndPassword("yash@team.hire3x.com", pw)
```

The domain needs no real mailboxes; Firebase validates address *format* only. Firebase's
uniqueness constraint on the address gives username uniqueness for free.

The UI never displays an `@`. Login has exactly two fields: Username, Password.

**Username rules**, enforced in the backend API and mirrored in the form:
lowercase `a-z0-9._-`, 3–20 characters, must begin with a letter, and must not be one
of the reserved words `admin`, `root`, `system`, `support`, `api`, `null`, `firebase`.

### 6.2 Consequence — no self-service password reset

Reset links would be sent to an undeliverable address, so the feature is removed.
The login page's "Forgot password?" explains that a super-admin resets it. This is
covered by the `resetUserPassword` function and the Team page, and is arguably safer:
no reset link ever sits in an inbox.

### 6.3 First login

An account created by an admin carries `mustChangePassword: true` on its `/users`
document. `RequireAuth` reads that document — not the auth token — so the gate takes
effect immediately without waiting for a claim refresh. It redirects any such session
to `/change-password` and blocks every other route until a
new password is set. On success the client calls `clearMustChangePassword`.

A "Change password" action remains permanently available from the account menu.

---

## 7. Authorisation

### 7.1 The matrix

| Capability | superadmin | admin | member |
| --- | :-: | :-: | :-: |
| Add / edit / delete expenses | yes | yes | yes |
| Set monthly budgets | yes | yes | no |
| Edit period and categories | yes | yes | no |
| Create a member | yes | yes | no |
| Create or promote an admin | yes | no | no |
| Reset a member's password | yes | yes | no |
| Reset an admin's password | yes | no | no |
| Disable a member | yes | yes | no |
| Disable an admin | yes | no | no |
| Be demoted, disabled, or deleted | **no** | yes | yes |

### 7.2 How immutability is guaranteed

Two independent mechanisms, both server-side:

1. `firestore.rules` contains a literal list of the two super-admin UIDs.
2. `src/shared/roles.js` contains the same literal list and is imported by both the
   browser bundle and the Vercel backend, so the two copies cannot drift. Every API
   route rejects any operation whose *target* UID appears in it.

Roles are carried in Firebase Auth **custom claims** so rules can check them without a
document read, and the `/users` mirror document exists for display only.

Because clients cannot write `/users` and cannot mint custom claims, there is no code
path — buggy or malicious — by which a member becomes an admin. The backend verifies the
caller's Firebase ID token on every request before reading their role.

### 7.3 Firestore rules — shape

```
isSignedIn()  request.auth != null
isActive()    the caller's /users doc has disabled != true
role()        request.auth.token.role
isSuper()     request.auth.uid in [<UID_YASH>, <UID_TITUS>]
isAdmin()     isSuper() || role() == "admin"

/settings/{d}   read: isSignedIn()          write: isAdmin()
/users/{u}      read: isSignedIn()          write: never (Admin SDK only)
/expenses/{e}   read: isSignedIn() && isActive()
                create/update/delete: isSignedIn() && isActive() && validExpense()
/budgets/{m}    read: isSignedIn()          write: isAdmin() && isActive()
/audit/{a}      read: isSignedIn()
                create: isSignedIn() && isActive() && by == uid()
                update, delete: never
/presence/{u}   read: isSignedIn()          write: isSignedIn() && u == request.auth.uid
```

`validExpense()` enforces the exact key set, types, ranges, that `month` agrees with
`date`, that `date` falls inside the configured period, and that `createdBy` /
`updatedBy` equal the caller's uid. Rules are the last line of defence; the form is
merely the first.

---

## 8. Backend API

Vercel Serverless Functions under `/api`, Node 20, TypeScript. Every route begins by
verifying the caller's Firebase ID token from the `Authorization: Bearer` header, loading
their `/users` document, and rejecting disabled accounts. Each route writes its own
`/audit` entry through the Admin SDK.

| Route | Caller | Behaviour |
| --- | --- | --- |
| `POST /api/users/create` | admin+ | Validates the username. Creates the auth user, sets the role custom claim, writes `/users`. A non-super admin may only create `member`. The temp password is supplied by the caller and never stored. |
| `POST /api/users/reset-password` | admin+ | Sets a new temp password and re-flags `mustChangePassword`. Admins may target members only. |
| `POST /api/users/set-role` | superadmin | Promotes between `member` and `admin` only. Rejects any target in the super-admin list, and refuses `superadmin` as a target role. |
| `POST /api/users/set-disabled` | admin+ | Admins may disable members only. Rejects any target in the super-admin list. |
| `POST /api/users/clear-must-change` | self | Called after a successful `updatePassword`. |

Expense and budget writes go **directly** from browser to Firestore, not through this
API. That is deliberate: it preserves realtime `onSnapshot` sync, optimistic updates, and
offline tolerance, none of which survive a round trip through a serverless function.
Security rules, not the API, are what protect those collections.

### 8.1 Bootstrap

Super-admins cannot be created by the app, since creating them requires an admin.
`scripts/bootstrap.mjs` runs once locally against a service-account key: it creates
Yash and Titus with temp passwords, sets their `superadmin` claims, writes their
`/users` documents, and prints their UIDs. Those UIDs are pasted into
`firestore.rules` and `src/shared/roles.js`.

The same service-account key is then base64-encoded into the Vercel environment variable
`FIREBASE_SERVICE_ACCOUNT`. The local copy is deleted afterwards. The key is never
committed; `.gitignore` covers `*serviceAccount*.json`.

---

## 9. Interface

### 9.1 Design tokens

Derived from the Hire3x product surface: white ground, near-black heavy display type,
a single vivid blue for action, pastel-tinted cards, fully rounded controls, generous
whitespace.

```
ink       #0A0A0B      muted   #6B7280     line    #E8EAEE     surface #F7F8FA
primary   #2D68FE      hover   #1D4FD8
peach #FFE9DC   sky #DCEBFF   mint #DFF3E6   lilac #ECE4FF   blush #FFE1EC   cream #FFF3D6
success   #12805C      danger  #DC2626      warn    #B45309
radius    16px cards / 999px controls
shadow    0 1px 2px rgba(16,24,40,.04), 0 8px 24px -8px rgba(16,24,40,.10)
type      Plus Jakarta Sans (display) + Inter (UI), tabular numerals for all money
```

Defined once in Tailwind v4's `@theme` block. No component hardcodes a hex value —
the current file's inline `PALETTE` object is removed entirely.

### 9.2 Clarity constraints

These are requirements, not aspirations, and every screen is checked against them:

- Navigation never exceeds four items: **Dashboard · Reports · Team · Settings**.
  Team and Settings are hidden from members rather than shown disabled.
- One primary action per screen. Everything else is secondary or tertiary.
- Labels are plain English. No "utilisation", no "variance" without a plain gloss.
- Interactive targets are at least 44px on their shortest edge.
- Every destructive action is undoable, not confirmed by a modal.
- Any inferred value is shown before it is committed, and is correctable in one click.

### 9.3 Routes

```
/login              username + password
/change-password    forced when mustChangePassword, otherwise voluntary
/                   dashboard, month view
/reports            report preview, PDF export, CSV import/export
/team               admin+ only
/settings           admin+ only
```

---

## 10. Failure points being fixed

Catalogued from the current `src/App.jsx`.

| # | Defect | Location today | Resolution |
| --- | --- | --- | --- |
| 1 | `MONTHS.find(...).full` dereferenced unguarded at three call sites | render body | Period derived from settings; lookups return a fallback; covered by a test with an out-of-range month |
| 2 | `todayISO()` clamps to hardcoded `2026-08-01`–`2027-01-31`, so from Feb 2027 every expense silently defaults to Jan 2027 | `todayISO` | Bounds come from `/settings/app`; out-of-period dates are rejected with a clear message rather than silently moved |
| 3 | Whole-state blob writes; concurrent editors overwrite each other | `persist()` | One document per expense |
| 4 | `persist()` is fire-and-forget with no await, retry, or debounce | `persist()` | Firestore's durable write queue; save state surfaced in the UI; failures raise a toast with a retry |
| 5 | `escapeHtml()` omits `'` and backtick, and its output is interpolated into HTML `style=` attributes | `escapeHtml`, `generateReport` | Full entity escaping; report generated through pdfmake, which takes text not markup, removing the injection surface |
| 6 | Ids are `"exp_" + Date.now()` and collide within a millisecond | `submitExpense` | `crypto.randomUUID()` |
| 7 | Delete is immediate with no confirmation and no recovery | `deleteExpense` | Optimistic delete with a 6-second undo toast; audit entry retains the payload |
| 8 | `Number(form.amount)` accepts `Infinity` and loses precision on large inputs | `submitExpense` | Explicit finite/range validation client-side and in rules |
| 9 | No authentication of any kind | whole file | §6, §7 |
| 10 | Zero test coverage | repository | Vitest unit suites plus emulator-backed rules tests |

---

## 11. Product features

### 11.1 Speed

- **Quick-add bar.** `25k meta ads anti-ghosting campaign 12 aug` becomes a complete
  expense. Amount accepts `25000`, `25,000`, `25k`, `1.2L`, `₹25000`. Dates accept
  `12 aug`, `aug 12`, `12/08`, `today`, `yesterday`. Categories fuzzy-match labels and
  aliases (`meta`/`fb`, `google`/`gads`). The remainder is the description.
  Parsed values render as chips beneath the input **before** submission, each one
  click-to-correct. The parser is a pure function in `lib/quickAdd.js` with an
  exhaustive unit suite.
- **Command palette** on `Cmd/Ctrl-K`: jump to a month, add an expense, search, export.
- **Shortcuts:** `n` new expense, `/` search, `Esc` dismiss.
- **Autocomplete** on description and invoice, sourced from prior entries.
- **Inline editing** in the list. The current scroll-to-form pattern is removed.
- **Undo toast** on every delete.

### 11.2 Collaboration

- Live `onSnapshot` sync across all sessions.
- Presence strip: who is signed in and which month they are looking at.
- A quiet toast when another user records an expense in the month you are viewing.
- `edited by @madesh, 2h ago` on each row, read from `/audit`.

### 11.3 Budget intelligence

- **Pacing.** Compares elapsed fraction of the month against spent fraction of budget,
  stated in plain language: "You are 60% through August and have used 91% of budget."
- **Duplicate warning.** On save, flags an existing expense with the same amount,
  category, and a date within three days. Warns; never blocks.
- **Repeat recurring.** One click copies the previous month's entries in categories
  marked recurring, dated to the current month, presented for review before commit.
- **Sparklines** per category across the configured period.

### 11.4 Reports

- **PDF** via `pdfmake` — real vector text and tables, one click, no print dialog and
  no canvas rasterisation. Carries the executive summary, category breakdown with
  month-over-month deltas, top expenses, period overview, and the full ledger that the
  current HTML report produces.
- **CSV export** of the ledger for finance.
- **CSV import** with a column-mapping step and a preview of what will be created,
  so a malformed file never writes partial data.

Receipt attachments are deliberately **out of scope**: they would require Cloud Storage,
which forces the Firebase project onto a paid plan. Invoice numbers remain as text on
each expense and appear in the ledger. Attachments can be added later without reworking
anything described here.

---

## 12. Migration

On first authenticated load the app checks `localStorage` for
`hire3x-marketing-budget-v1`. If found and the Firestore expense collection is empty,
it offers a one-time import showing the count of expenses and budgets to be brought
across. The localStorage key is left in place afterwards as a backup; nothing is
deleted.

---

## 13. Testing

| Suite | Covers |
| --- | --- |
| `lib/quickAdd` | every amount, date, and category form, plus garbage input |
| `lib/format` | currency, date, full HTML escaping including `'` and backtick |
| `lib/period` | month derivation, boundaries, invalid and inverted settings |
| `lib/csv` | round-trip, malformed rows, injection-prone cell values |
| budget math | totals, remaining, utilisation, pacing, division by zero |
| rules (emulator) | every cell of the §7.1 matrix, both allow and deny |
| `shared/roles` | guard matrix; the super-admin list is non-empty and well-formed |
| api routes | token verification, role guards, super-admin rejection, input validation |
| components | login, quick-add, undo delete, forced password change |

The rules suite is the important one: it asserts that a member cannot write `/users`,
cannot set a budget, and that no caller can demote a super-admin.

---

## 14. Setup inputs required before build

These are supplied by the user; the build cannot complete without them.

1. Display name and username for each of the five people.
2. A Firebase project on the free **Spark** plan with Email/Password auth and Firestore
   enabled, and the web app `firebaseConfig` block.
3. A Vercel project linked to this repository, on the free Hobby plan.
4. The two super-admin UIDs, produced by running `scripts/bootstrap.mjs` (§8.1).
5. A Firebase service-account key, base64-encoded into the Vercel environment variable
   `FIREBASE_SERVICE_ACCOUNT`.

Items 1–3 are inputs. Items 4–5 are generated during setup; the UIDs are pasted into
`firestore.rules` and `src/shared/roles.js`.

---

## 15. Build order

1. **Foundation.** Firebase wiring, emulator config, auth provider, login, forced
   password change, route guards, bootstrap script, rules v1 with tests.
2. **Data layer.** Settings, expenses, budgets hooks. localStorage migration. Unit tests.
3. **Interface.** Tokens, shadcn install, shell, dashboard, expense list, budget panel.
4. **Administration.** Team page, Settings page, the five API routes, role tests.
5. **Product layer.** Quick-add, palette, shortcuts, autocomplete, inline edit, undo,
   presence, pacing, duplicates, recurring.
6. **Reports.** PDF, CSV import and export.
7. **Hardening.** Security review, full failure-point sweep against §10, deploy.
