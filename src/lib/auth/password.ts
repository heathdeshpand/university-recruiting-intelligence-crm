import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt is memory-hard and built in, which keeps a native bcrypt/argon2
 * dependency out of the tree. The stored format carries its own parameters so
 * that cost can be raised later without invalidating existing hashes.
 *
 * Format: scrypt$N$r$p$<salt-base64>$<key-base64>
 */

const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEYLEN);
  return ["scrypt", 16384, 8, 1, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const saltB64 = parts[4];
  const keyB64 = parts[5];
  if (!saltB64 || !keyB64) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64");
    expected = Buffer.from(keyB64, "base64");
  } catch {
    return false;
  }
  if (expected.length !== KEYLEN) return false;

  const actual = await scrypt(password, salt, KEYLEN);
  // Constant-time comparison: never leak how much of the hash matched.
  return timingSafeEqual(actual, expected);
}
