export const prerender = false;

import type { APIRoute } from 'astro';

const PYTHON_API_URL = import.meta.env.PYTHON_API_URL || process.env.PYTHON_API_URL || 'http://localhost:5001';

export const GET: APIRoute = async ({ url }) => {
  try {
    const alumniId = (url.searchParams.get('alumni_id') || '').trim();
    if (!alumniId) {
      return new Response(JSON.stringify({ success: false, message: 'alumni_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(`${PYTHON_API_URL}/api/ai/profile-completeness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alumni_id: alumniId }),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: 'Failed to fetch profile completeness', error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
