import type { AstroCookies } from 'astro';
import { createHash } from 'crypto';

// In production, use environment variables
const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || 'admin',
  // Hash of password (use bcrypt in production)
  passwordHash: process.env.ADMIN_PASSWORD_HASH || hashPassword('admin123'),
};

const SESSION_COOKIE_NAME = 'admin_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-key-in-production';

/**
 * Hash password (use bcrypt or argon2 in production)
 */
export function hashPassword(password: string): string {
  return createHash('sha256')
    .update(password + SESSION_SECRET)
    .digest('hex');
}

/**
 * Verify password
 */
export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

/**
 * Create session token
 */
export function createSessionToken(username: string): string {
  const timestamp = Date.now();
  const payload = JSON.stringify({ username, timestamp });
  const signature = createHash('sha256')
    .update(payload + SESSION_SECRET)
    .digest('hex');
  
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
}

/**
 * Verify session token
 */
export function verifySessionToken(token: string): { valid: boolean; username?: string } {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const { payload, signature } = decoded;
    
    // Verify signature
    const expectedSignature = createHash('sha256')
      .update(payload + SESSION_SECRET)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return { valid: false };
    }
    
    // Parse payload
    const data = JSON.parse(payload);
    const { username, timestamp } = data;
    
    // Check if session is expired (24 hours)
    const sessionAge = Date.now() - timestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (sessionAge > maxAge) {
      return { valid: false };
    }
    
    return { valid: true, username };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Authenticate user
 */
export function authenticateUser(username: string, password: string): boolean {
  if (username !== ADMIN_CREDENTIALS.username) {
    return false;
  }
  
  return verifyPassword(password, ADMIN_CREDENTIALS.passwordHash);
}

/**
 * Check if user is authenticated from cookies
 */
export function isAuthenticated(cookies: AstroCookies): boolean {
  const sessionToken = cookies.get(SESSION_COOKIE_NAME)?.value;
  
  if (!sessionToken) {
    return false;
  }
  
  const { valid } = verifySessionToken(sessionToken);
  return valid;
}

/**
 * Get current user from cookies
 */
export function getCurrentUser(cookies: AstroCookies): string | null {
  const sessionToken = cookies.get(SESSION_COOKIE_NAME)?.value;
  
  if (!sessionToken) {
    return null;
  }
  
  const { valid, username } = verifySessionToken(sessionToken);
  
  if (!valid) {
    return null;
  }
  
  return username || null;
}

/**
 * Set authentication cookie
 */
export function setAuthCookie(cookies: AstroCookies, username: string): void {
  const token = createSessionToken(username);
  
  cookies.set(SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

/**
 * Clear authentication cookie
 */
export function clearAuthCookie(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE_NAME, {
    path: '/',
  });
}

/**
 * Require authentication middleware
 */
export function requireAuth(cookies: AstroCookies, redirectTo: string = '/admin/login') {
  if (!isAuthenticated(cookies)) {
    return Response.redirect(redirectTo);
  }
  return null;
}