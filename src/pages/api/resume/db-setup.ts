export const prerender = false;

import type { APIContext } from 'astro';
import { sql } from '@vercel/postgres';

export async function GET(_ctx: APIContext) {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS resume_analyses (
        id SERIAL PRIMARY KEY,
        alumni_email VARCHAR(255) NOT NULL,
        file_name VARCHAR(500),
        file_url VARCHAR(1000),
        ats_score INTEGER,
        match_score FLOAT,
        missing_keywords TEXT[],
        improvements JSONB,
        top_job_matches JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_resume_alumni_email ON resume_analyses(alumni_email)
    `;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'resume_analyses table and index created (or already exist).',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('DB setup error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to set up database tables.',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
