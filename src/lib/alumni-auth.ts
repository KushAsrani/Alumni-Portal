import type { AstroCookies } from 'astro';
import { createHash } from 'crypto';
import { connectToDatabase } from './mongodb';

const ALUMNI_SESSION_COOKIE_NAME = 'alumni_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-key-in-production';

export interface AlumniSessionData {
  id: string;
  username: string;
  name: string;
  email: string;
  photoUrl?: string;
}

/**
 * Hash a password with the session secret
 */
export function hashAlumniPassword(password: string): string {
  return createHash('sha256')
    .update(password + SESSION_SECRET)
    .digest('hex');
}

/**
 * Create a signed session token for an alumni
 */
function createAlumniSessionToken(data: AlumniSessionData): string {
  const timestamp = Date.now();
  const payload = JSON.stringify({ ...data, timestamp });
  const signature = createHash('sha256')
    .update(payload + SESSION_SECRET)
    .digest('hex');

  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
}

/**
 * Verify and decode an alumni session token
 */
function verifyAlumniSessionToken(
  token: string
): { valid: boolean; data?: AlumniSessionData; error?: string } {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());

    if (!decoded.payload || !decoded.signature) {
      return { valid: false, error: 'Invalid token structure' };
    }

    const { payload, signature } = decoded;

    const expectedSignature = createHash('sha256')
      .update(payload + SESSION_SECRET)
      .digest('hex');

    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid signature' };
    }

    const { timestamp, ...sessionData } = JSON.parse(payload) as AlumniSessionData & {
      timestamp: number;
    };

    if (!sessionData.id || !timestamp) {
      return { valid: false, error: 'Invalid payload data' };
    }

    // 24-hour session expiry
    const sessionAge = Date.now() - timestamp;
    const maxAge = 24 * 60 * 60 * 1000;

    if (sessionAge > maxAge || sessionAge < 0) {
      return { valid: false, error: 'Session expired' };
    }

    return { valid: true, data: sessionData };
  } catch {
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * Check whether an alumni is authenticated from cookies
 */
export function isAlumniAuthenticated(cookies: AstroCookies): boolean {
  try {
    const cookie = cookies.get(ALUMNI_SESSION_COOKIE_NAME);
    if (!cookie?.value) return false;
    const { valid } = verifyAlumniSessionToken(cookie.value);
    if (!valid) {
      cookies.delete(ALUMNI_SESSION_COOKIE_NAME, { path: '/' });
    }
    return valid;
  } catch {
    return false;
  }
}

/**
 * Get the currently-logged-in alumni's session data from cookies
 */
export function getAlumniSession(cookies: AstroCookies): AlumniSessionData | null {
  try {
    const cookie = cookies.get(ALUMNI_SESSION_COOKIE_NAME);
    if (!cookie?.value) return null;
    const { valid, data } = verifyAlumniSessionToken(cookie.value);
    if (!valid || !data) {
      cookies.delete(ALUMNI_SESSION_COOKIE_NAME, { path: '/' });
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Set the alumni session cookie
 */
export function setAlumniAuthCookie(
  cookies: AstroCookies,
  id: string,
  username: string,
  name: string,
  email: string,
  photoUrl?: string
): void {
  const token = createAlumniSessionToken({ id, username, name, email, photoUrl });

  cookies.set(ALUMNI_SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

/**
 * Clear the alumni session cookie
 */
export function clearAlumniAuthCookie(cookies: AstroCookies): void {
  cookies.delete(ALUMNI_SESSION_COOKIE_NAME, { path: '/' });
}

/**
 * Authenticate an alumni by username/email + password against MongoDB.
 * Returns the session data on success, or null on failure.
 */
export async function authenticateAlumni(
  usernameOrEmail: string,
  password: string
): Promise<AlumniSessionData | null> {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    const query = usernameOrEmail.includes('@')
      ? { email: usernameOrEmail.trim() }
      : { username: usernameOrEmail.trim() };

    const alumni = await collection.findOne(query);

    if (!alumni) return null;

    // Only approved alumni may log in
    if (alumni.status !== 'approved') return null;

    if (!alumni.password) return null;

    const inputHash = hashAlumniPassword(password.trim());
    if (inputHash !== alumni.password) return null;

    return {
      id: alumni._id.toString(),
      username: alumni.username || alumni.email,
      name: alumni.name,
      email: alumni.email,
      photoUrl: alumni.photo_blob_url || undefined,
    };
  } catch (err) {
    console.error('Alumni authentication error:', err);
    return null;
  }
}
