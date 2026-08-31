// O/0 and I/l/1 are omitted: these passwords get read aloud or typed from a chat message.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const DIGITS = "23456789";
const LETTERS = ALPHABET.slice(0, ALPHABET.length - DIGITS.length);
const LENGTH = 14;

export function generateTempPassword() {
  const draw = new Uint32Array(LENGTH + 4);
  crypto.getRandomValues(draw);

  const chars = [];
  for (let i = 0; i < LENGTH; i++) chars.push(ALPHABET[draw[i] % ALPHABET.length]);

  // Both classes are placed rather than hoped for: a 14-character draw from this
  // alphabet misses digits about one time in fourteen. The positions are random so
  // the format itself leaks nothing.
  const digitAt = draw[LENGTH] % LENGTH;
  const letterAt = (digitAt + 1 + (draw[LENGTH + 1] % (LENGTH - 1))) % LENGTH;
  chars[digitAt] = DIGITS[draw[LENGTH + 2] % DIGITS.length];
  chars[letterAt] = LETTERS[draw[LENGTH + 3] % LETTERS.length];

  return chars.join("");
}

/**
 * @param {unknown} value
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validatePassword(value) {
  if (typeof value !== "string") return { ok: false, reason: "Enter a password." };
  if (value.length < 10) return { ok: false, reason: "Use at least 10 characters." };
  if (value.length > 128) return { ok: false, reason: "That password is too long." };
  if (!/[A-Za-z]/.test(value)) return { ok: false, reason: "Include at least one letter." };
  if (!/[0-9]/.test(value)) return { ok: false, reason: "Include at least one number." };
  return { ok: true };
}
