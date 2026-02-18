export const prerender = false; // Enable SSR

import type { APIRoute } from 'astro';
import { clearAuthCookie } from '../../../lib/auth';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  clearAuthCookie(cookies);
  return redirect('/admin/login');
};

export const GET: APIRoute = async ({ cookies, redirect }) => {
  clearAuthCookie(cookies);
  return redirect('/admin/login');
};