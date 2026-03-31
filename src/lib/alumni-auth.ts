import type { AstroCookies } from 'astro';
import { createHash } from 'crypto';
import { connectToDatabase } from './mongodb';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const ALUMNI_COOKIE_NAME = 'alumni_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-key-in-production';

/**
 * Hash password for alumni
 */
export function hashAlumniPassword(password: string): string {
  return createHash('sha256')
    .update(password + SESSION_SECRET)
    .digest('hex');
}

/**
 * Verify alumni password
 */
export function verifyAlumniPassword(password: string, hash: string): boolean {
  const inputHash = hashAlumniPassword(password);
  return inputHash === hash;
}

/**
 * Create alumni session token
 */
export function createAlumniSessionToken(alumniId: string, username: string, name: string, photoUrl?: string): string {
  const timestamp = Date.now();
  const payload = JSON.stringify({ alumniId, username, name, photoUrl, timestamp });
  const signature = createHash('sha256')
    .update(payload + SESSION_SECRET)
    .digest('hex');
  
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
}

/**
 * Verify alumni session token
 */
export function verifyAlumniSessionToken(token: string): {
  valid: boolean;
  alumniId?: string;
  username?: string;
  name?: string;
  photoUrl?: string;
  error?: string;
} {
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
    
    const data = JSON.parse(payload);
    const { alumniId, username, name, photoUrl, timestamp } = data;
    
    if (!alumniId || !username || !timestamp) {
      return { valid: false, error: 'Invalid payload data' };
    }
    
    // Session expires in 7 days
    const sessionAge = Date.now() - timestamp;
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    
    if (sessionAge > maxAge || sessionAge < 0) {
      return { valid: false, error: 'Session expired' };
    }
    
    return { valid: true, alumniId, username, name, photoUrl };
  } catch (error) {
    console.error('Alumni session verification error:', error);
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * Authenticate alumni user against MongoDB
 */
export async function authenticateAlumni(usernameOrEmail: string, password: string): Promise<{
  success: boolean;
  message: string;
  alumni?: any;
}> {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');
    
    // Find by username OR email
    const alumni = await collection.findOne({
      $or: [
        { username: usernameOrEmail.trim() },
        { email: usernameOrEmail.trim().toLowerCase() }
      ]
    });
    
    if (!alumni) {
      return { success: false, message: 'Invalid username/email or password' };
    }
    
    if (alumni.status !== 'approved') {
      return { success: false, message: 'Your account is not yet approved. Please wait for admin approval.' };
    }
    
    if (!alumni.login_enabled) {
      return { success: false, message: 'Your login access has not been activated yet.' };
    }
    
    if (!alumni.password_hash) {
      return { success: false, message: 'No password set for this account. Please contact admin.' };
    }
    
    if (!verifyAlumniPassword(password, alumni.password_hash)) {
      return { success: false, message: 'Invalid username/email or password' };
    }
    
    // Update last login
    await collection.updateOne(
      { _id: alumni._id },
      { $set: { last_login: new Date() } }
    );
    
    return { success: true, message: 'Login successful', alumni };
  } catch (error) {
    console.error('Alumni authentication error:', error);
    return { success: false, message: 'An error occurred during authentication' };
  }
}

/**
 * Check if alumni is logged in
 */
export function isAlumniAuthenticated(cookies: AstroCookies): boolean {
  const sessionToken = cookies.get(ALUMNI_COOKIE_NAME);
  if (!sessionToken || !sessionToken.value) return false;
  const { valid } = verifyAlumniSessionToken(sessionToken.value);
  return valid;
}

/**
 * Get current alumni user from cookies
 */
export function getCurrentAlumni(cookies: AstroCookies): {
  alumniId: string;
  username: string;
  name: string;
  photoUrl?: string;
} | null {
  try {
    const sessionToken = cookies.get(ALUMNI_COOKIE_NAME);
    if (!sessionToken || !sessionToken.value) return null;
    
    const { valid, alumniId, username, name, photoUrl } = verifyAlumniSessionToken(sessionToken.value);
    if (!valid || !alumniId || !username || !name) return null;
    
    return { alumniId, username, name, photoUrl };
  } catch {
    return null;
  }
}

/**
 * Set alumni session cookie
 */
export function setAlumniAuthCookie(cookies: AstroCookies, alumniId: string, username: string, name: string, photoUrl?: string): void {
  const token = createAlumniSessionToken(alumniId, username, name, photoUrl);
  
  cookies.set(ALUMNI_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

/**
 * Clear alumni session cookie
 */
export function clearAlumniAuthCookie(cookies: AstroCookies): void {
  cookies.delete(ALUMNI_COOKIE_NAME, { path: '/' });
}