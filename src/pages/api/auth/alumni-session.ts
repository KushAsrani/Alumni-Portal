export const prerender = false;

import type { APIRoute } from 'astro';
import { getAlumniSession } from '../../../lib/alumni-auth';

export const GET: APIRoute = async ({ cookies }) => {
  const session = getAlumniSession(cookies);

  if (!session) {
    return new Response(JSON.stringify({ loggedIn: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      loggedIn: true,
      id: session.id,
      username: session.username,
      name: session.name,
      email: session.email,
      photoUrl: session.photoUrl || null,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
