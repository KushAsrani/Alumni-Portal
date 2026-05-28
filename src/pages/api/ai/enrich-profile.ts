export const prerender = false;

import type { APIRoute } from 'astro';

const PYTHON_API_URL = import.meta.env.PYTHON_API_URL || process.env.PYTHON_API_URL || 'http://localhost:5001';

export const POST: APIRoute = async ({ request }) => {
  try {
    const adminKey = import.meta.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY || '';
    const expectedAuth = 'Bearer ' + adminKey;
    const authHeader = request.headers.get('Authorization') || '';

    if (!authHeader || authHeader !== expectedAuth) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const response = await fetch(`${PYTHON_API_URL}/api/ai/enrich-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: 'Failed to enrich profile', error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
