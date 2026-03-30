import { createHmac, pbkdf2Sync, timingSafeEqual } from 'crypto';

const HASH_ROUNDS = 100000;
const HASH_KEY_LENGTH = 64;
const HASH_DIGEST = 'sha512';

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

export function hashPassword(password: string, salt: string) {
  return pbkdf2Sync(password, salt, HASH_ROUNDS, HASH_KEY_LENGTH, HASH_DIGEST).toString('hex');
}

export function buildStoredPasswordHash(password: string, salt: string) {
  return `${salt}:${hashPassword(password, salt)}`;
}

export function verifyStoredPasswordHash(password: string, storedHash: string) {
  const [salt, expectedHash] = storedHash.split(':');
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = hashPassword(password, salt);
  return timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
}

export function signAuthToken(payload: Record<string, unknown>, secret: string) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(encodedPayload).digest();
  return `${encodedPayload}.${toBase64Url(signature)}`;
}

export function verifyAuthToken(token: string, secret: string) {
  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest();
  const actualSignature = fromBase64Url(encodedSignature);

  if (expectedSignature.length !== actualSignature.length) {
    return null;
  }

  if (!timingSafeEqual(expectedSignature, actualSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8')) as Record<string, unknown>;
    return payload;
  } catch {
    return null;
  }
}
