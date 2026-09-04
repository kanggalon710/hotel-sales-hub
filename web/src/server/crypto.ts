
import {
  createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual,
} from 'node:crypto';

/**
 * Secrets at rest (PRD 17.3). In production CRM_SECRET_KEY must come from a
 * secret manager; the dev fallback is derived so a missing key never silently
 * produces an all-zero encryption key.
 */
function masterKey() {
  const raw = process.env.CRM_SECRET_KEY;
  if (raw && raw.length >= 32) return createHash('sha256').update(raw).digest();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRM_SECRET_KEY is required in production (min 32 chars).');
  }
  return createHash('sha256').update('crm-hotel-dev-key-do-not-use-in-production').digest();
}

export function encryptSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const [v, ivB64, tagB64, dataB64] = payload.split('.');
  if (v !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/* --------------------------- Password hashing --------------------------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false;
  const [scheme, N, r, p, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  try {
    const expected = Buffer.from(keyB64, 'base64url');
    const actual = scryptSync(password, Buffer.from(saltB64, 'base64url'), expected.length, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* ------------------------------- Tokens -------------------------------- */

export function newToken() {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function newId(prefix = '') {
  return prefix ? `${prefix}_${randomBytes(12).toString('hex')}` : randomBytes(16).toString('hex');
}

/** Stable fingerprint for webhook dedup (PRD FR-04). */
export function fingerprint(parts: (string | number | null | undefined)[]) {
  return createHash('sha256').update(parts.map((p) => String(p ?? '')).join('|')).digest('hex');
}
