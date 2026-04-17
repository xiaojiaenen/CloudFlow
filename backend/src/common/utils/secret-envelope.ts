import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const SECRET_ENVELOPE_PREFIX = 'enc:v1:';
const DEFAULT_SECRET_KEY = 'cloudflow-dev-secret-key';

function getNormalizedKey(secret?: string) {
  const source = secret?.trim() || DEFAULT_SECRET_KEY;
  return createHash('sha256').update(source).digest();
}

export function isEncryptedEnvelope(value?: string | null) {
  return typeof value === 'string' && value.startsWith(SECRET_ENVELOPE_PREFIX);
}

export function encryptSecretValue(value: string, secret?: string) {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  if (isEncryptedEnvelope(normalized)) {
    return normalized;
  }

  const key = getNormalizedKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(normalized, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${SECRET_ENVELOPE_PREFIX}${iv.toString('base64')}:${authTag.toString(
    'base64',
  )}:${encrypted.toString('base64')}`;
}

export function decryptSecretValue(value?: string | null, secret?: string) {
  if (!value?.trim()) {
    return '';
  }

  if (!isEncryptedEnvelope(value)) {
    return value;
  }

  const payload = value.slice(SECRET_ENVELOPE_PREFIX.length);
  const [ivBase64, authTagBase64, encryptedBase64] = payload.split(':');
  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error('Invalid secret envelope payload.');
  }

  const key = getNormalizedKey(secret);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivBase64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function encryptJsonValue(
  payload: Record<string, unknown>,
  secret?: string,
) {
  return encryptSecretValue(JSON.stringify(payload), secret);
}

export function decryptJsonValue(
  ciphertext?: string | null,
  secret?: string,
): Record<string, unknown> {
  if (!ciphertext?.trim()) {
    return {};
  }

  const plaintext = decryptSecretValue(ciphertext, secret);
  const parsed = JSON.parse(plaintext);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

export function maskSecretValue(value: string) {
  if (!value) {
    return '';
  }

  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }

  return `${'*'.repeat(Math.max(4, value.length - 2))}${value.slice(-2)}`;
}
