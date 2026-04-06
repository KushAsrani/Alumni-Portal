export const prerender = false;

import type { APIContext } from 'astro';
import { sql } from '@vercel/postgres';

export async function GET({ request }: APIContext) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get('email');

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, message: 'email query parameter is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await sql`
      SELECT
        id,
        alumni_email,
        file_name,
        file_url,
        ats_score,
        match_score,
        missing_keywords,
        improvements,
        top_job_matches,
        created_at
      FROM resume_analyses
      WHERE alumni_email = ${email}
      ORDER BY created_at DESC
      LIMIT 10
    `;

    return new Response(
      JSON.stringify({ success: true, analyses: result.rows }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Resume history error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to fetch resume history.',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
