// tests/api-guard.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { canActOn, effectiveRole, SUPER_ADMIN_UIDS } from "../src/shared/roles.js";

// requireTarget's decision logic lives entirely in canActOn, so the behaviour that
// matters is asserted without standing up the Admin SDK. Read the UIDs from the
// registry rather than hardcoding them, so this keeps testing the real identities if
// the list ever changes.
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
