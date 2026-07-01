import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for the demo/dev auth story. scrypt (node:crypto, no deps).
 * Stored as "salt:hash" hex. Server-only — imported by the seed and the web
 * login server action, never by client code.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored?: string | null): boolean {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
