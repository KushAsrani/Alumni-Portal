export const prerender = false;

import type { APIRoute } from 'astro';
import { getCurrentAlumni } from '../../../lib/alumni-auth';

export const GET: APIRoute = async ({ cookies }) => {
  const alumni = getCurrentAlumni(cookies);
  
  if (!alumni) {
    return new Response(
      JSON.stringify({ authenticated: false }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  return new Response(
    JSON.stringify({
      authenticated: true,
      data: {
        name: alumni.name,
        username: alumni.username,
        photoUrl: alumni.photoUrl
      }
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};