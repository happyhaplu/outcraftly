import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // AES-GCM recommended IV length
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const secret = process.env.SENDER_CREDENTIALS_KEY;
  if (!secret) {
    throw new Error('SENDER_CREDENTIALS_KEY environment variable is not set');
  }

  if (secret.length < 32) {
    throw new Error('SENDER_CREDENTIALS_KEY must be at least 32 characters long');
  }

  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plainText: string): string {
  if (!plainText) {
    throw new Error('Value to encrypt must be provided');
  }

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptSecret(encryptedValue: string): string {
  if (!encryptedValue) {
    throw new Error('Encrypted value must be provided');
  }

  const key = getKey();
  const buffer = Buffer.from(encryptedValue, 'base64');

  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const data = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}
