export const prerender = false;

import type { APIRoute } from 'astro';
import { clearAlumniAuthCookie } from '../../../lib/alumni-auth';

export const POST: APIRoute = async ({ cookies }) => {
  clearAlumniAuthCookie(cookies);
  return new Response(
    JSON.stringify({ success: true, message: 'Logged out successfully' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

export const GET: APIRoute = async ({ cookies, redirect }) => {
  clearAlumniAuthCookie(cookies);
  return redirect('/');
};