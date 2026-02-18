import type { AstroCookies } from 'astro';
import { createHash } from 'crypto';

// Configuration constants
const SESSION_COOKIE_NAME = 'admin_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-key-in-production';

// Default credentials
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin123';

/**
 * Hash password (use bcrypt or argon2 in production)
 */
export function hashPassword(password: string): string {
  return createHash('sha256')
    .update(password + SESSION_SECRET)
    .digest('hex');
}

/**
 * Get admin credentials
 * Calculate password hash dynamically based on current SESSION_SECRET
 */
function getAdminCredentials() {
  const username = process.env.ADMIN_USERNAME || DEFAULT_USERNAME;
  
  // If custom password hash is provided, use it
  // Otherwise, hash the default password with current SESSION_SECRET
  const passwordHash = process.env.ADMIN_PASSWORD_HASH || hashPassword(DEFAULT_PASSWORD);
  
  return {
    username,
    passwordHash
  };
}

/**
 * Verify password
 */
export function verifyPassword(password: string, hash: string): boolean {
  const inputHash = hashPassword(password);
  console.log('Verifying password:');
  console.log('  Input hash:', inputHash);
  console.log('  Expected hash:', hash);
  console.log('  Match:', inputHash === hash);
  return inputHash === hash;
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
export function verifySessionToken(token: string): { valid: boolean; username?: string; error?: string } {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    
    if (!decoded.payload || !decoded.signature) {
      return { valid: false, error: 'Invalid token structure' };
    }
    
    const { payload, signature } = decoded;
    
    // Verify signature
    const expectedSignature = createHash('sha256')
      .update(payload + SESSION_SECRET)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid signature' };
    }
    
    const data = JSON.parse(payload);
    const { username, timestamp } = data;
    
    if (!username || !timestamp) {
      return { valid: false, error: 'Invalid payload data' };
    }
    
    // Check if session is expired (24 hours)
    const sessionAge = Date.now() - timestamp;
    const maxAge = 24 * 60 * 60 * 1000;
    
    if (sessionAge > maxAge || sessionAge < 0) {
      return { valid: false, error: 'Session expired' };
    }
    
    return { valid: true, username };
  } catch (error) {
    console.error('Session verification error:', error);
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * Authenticate user
 */
export function authenticateUser(username: string, password: string): boolean {
  const credentials = getAdminCredentials();
  
  // Trim whitespace
  username = username.trim();
  password = password.trim();
  
  console.log('Authentication attempt:');
  console.log('  Username:', username);
  console.log('  Expected username:', credentials.username);
  console.log('  Username match:', username === credentials.username);
  
  if (!username || !password) {
    console.log('  Result: Empty credentials');
    return false;
  }
  
  if (username !== credentials.username) {
    console.log('  Result: Username mismatch');
    return false;
  }
  
  const result = verifyPassword(password, credentials.passwordHash);
  console.log('  Result:', result ? 'SUCCESS' : 'FAILED');
  
  return result;
}

/**
 * Check if user is authenticated from cookies
 */
export function isAuthenticated(cookies: AstroCookies): boolean {
  try {
    const sessionToken = cookies.get(SESSION_COOKIE_NAME);
    
    if (!sessionToken || !sessionToken.value) {
      return false;
    }
    
    const { valid, error } = verifySessionToken(sessionToken.value);
    
    if (!valid) {
      console.log('Invalid session:', error);
      cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Authentication check error:', error);
    cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return false;
  }
}

/**
 * Get current user from cookies
 */
export function getCurrentUser(cookies: AstroCookies): string | null {
  try {
    const sessionToken = cookies.get(SESSION_COOKIE_NAME);
    
    if (!sessionToken || !sessionToken.value) {
      return null;
    }
    
    const { valid, username } = verifySessionToken(sessionToken.value);
    
    if (!valid) {
      cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
      return null;
    }
    
    return username || null;
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
}

/**
 * Set authentication cookie
 */
export function setAuthCookie(cookies: AstroCookies, username: string): void {
  const token = createSessionToken(username);
  
  cookies.set(SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
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