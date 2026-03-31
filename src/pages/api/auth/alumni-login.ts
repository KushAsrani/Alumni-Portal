export const prerender = false;

import type { APIRoute } from 'astro';
import { authenticateAlumni, setAlumniAuthCookie } from '../../../lib/alumni-auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { username, password } = body;
    
    if (!username || !password) {
      return new Response(
        JSON.stringify({ success: false, message: 'Username/email and password are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const result = await authenticateAlumni(username, password);
    
    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, message: result.message }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const alumni = result.alumni;
    
    // Set session cookie
    setAlumniAuthCookie(
      cookies,
      alumni._id.toString(),
      alumni.username || alumni.email,
      alumni.name,
      alumni.photo_blob_url
    );
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Login successful',
        data: {
          name: alumni.name,
          username: alumni.username,
          photo_blob_url: alumni.photo_blob_url
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Alumni login error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'An error occurred during login' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};