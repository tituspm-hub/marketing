// tests/roles.test.js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  SUPER_ADMIN_UIDS, isSuperAdmin, effectiveRole,
  canManageUsers, canAssignRoles, canActOn,
} from "../src/shared/roles.js";

const [YASH, TITUS, GEBIN] = SUPER_ADMIN_UIDS;

describe("the registry itself", () => {
  it("holds exactly the three named super-admins", () => {
    expect([...SUPER_ADMIN_UIDS]).toEqual(["sa_yash", "sa_titus", "sa_gebin"]);
  });
  it("cannot be mutated at runtime", () => {
    expect(() => SUPER_ADMIN_UIDS.push("uid_attacker")).toThrow();
  });
});

// The single most valuable test in this suite. Firestore rules and the JS registry are
// two independent enforcement points; if they ever disagree, one of them is wrong and
// the immutability guarantee has a hole. This makes divergence impossible to commit.
describe("firestore.rules agrees with the registry", () => {
  it("lists the identical super-admin UIDs in the same order", () => {
    const rules = readFileSync("firestore.rules", "utf8");
    const match = rules.match(/function superAdmins\(\)\s*\{[^}]*return\s*\[([^\]]*)\]/);
    expect(match, "superAdmins() not found in firestore.rules").not.toBeNull();
    const inRules = match[1]
      .split(",")
      .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
    expect(inRules).toEqual([...SUPER_ADMIN_UIDS]);
  });
});

describe("effectiveRole", () => {
  it("returns superadmin for every listed UID no matter what the document says", () => {
    expect(effectiveRole(YASH, "member")).toBe("superadmin");
    expect(effectiveRole(TITUS, undefined)).toBe("superadmin");
    expect(effectiveRole(GEBIN, "member")).toBe("superadmin");
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

  it("never lets anyone act on a super-admin, including another super-admin", () => {
    for (const target of [YASH, TITUS, GEBIN]) {
      expect(act(TITUS, "superadmin", target, "superadmin")).toBe(false);
      expect(act(GEBIN, "superadmin", target, "superadmin")).toBe(false);
      expect(act("uid_a", "admin", target, "superadmin")).toBe(false);
      expect(act("uid_m", "member", target, "superadmin")).toBe(false);
    }
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
