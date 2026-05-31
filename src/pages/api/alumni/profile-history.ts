export const prerender = false;

import type { APIRoute } from 'astro';
import { isAlumniAuthenticated, getCurrentAlumni } from '../../../lib/alumni-auth';
import { getProfileHistory } from '../../../lib/profile-history';

export const GET: APIRoute = async ({ cookies }) => {
  if (!isAlumniAuthenticated(cookies)) {
    return new Response(JSON.stringify({ history: [] }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const session = getCurrentAlumni(cookies);
    const history = session ? await getProfileHistory(session.alumniId, 20) : [];

    return new Response(JSON.stringify({ history }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Profile history API error:', error);
    return new Response(JSON.stringify({ history: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
