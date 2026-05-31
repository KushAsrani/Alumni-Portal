import { createHmac, randomBytes } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TIME_STEP_SECONDS = 30;
const DIGITS = 6;

export function generateTOTPSecret(): string {
  return randomBytes(20).toString('hex');
}

export function secretToBase32(hexSecret: string): string {
  const bytes = Buffer.from(hexSecret, 'hex');
  let bits = '';

  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }

  let output = '';
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }

  return output;
}

export function generateTOTP(secret: string, window = 0): string {
  const counter = Math.floor(Date.now() / 1000 / TIME_STEP_SECONDS) + window;
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', Buffer.from(secret, 'hex'))
    .update(counterBuffer)
    .digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function verifyTOTP(secret: string, token: string, window = 1): boolean {
  const normalizedToken = token.trim();

  for (let offset = -window; offset <= window; offset += 1) {
    if (generateTOTP(secret, offset) === normalizedToken) {
      return true;
    }
  }

  return false;
}

export function generateBackupCodes(count = 8): string[] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  return Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('').slice(0, 8);
  });
}

export function getTOTPUri(secret: string, accountName: string, issuer: string): string {
  const base32Secret = secretToBase32(secret);
  const label = `${issuer}:${accountName}`;

  return `otpauth://totp/${encodeURIComponent(label)}?secret=${base32Secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
