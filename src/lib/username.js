export const USERNAME_DOMAIN = "team.hire3x.com";

const PATTERN = /^[a-z][a-z0-9._-]{2,19}$/;
const RESERVED = new Set(["admin", "root", "system", "support", "api", "null", "firebase"]);

/**
 * @param {unknown} input
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
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
