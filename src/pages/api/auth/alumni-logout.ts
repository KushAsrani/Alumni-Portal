export const prerender = false;

import type { APIRoute } from 'astro';
import { clearAlumniAuthCookie } from '../../../lib/alumni-auth';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  clearAlumniAuthCookie(cookies);
  return redirect('/');
};

export const GET: APIRoute = async ({ cookies, redirect }) => {
  clearAlumniAuthCookie(cookies);
  return redirect('/');
};
