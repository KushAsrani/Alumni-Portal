export const prerender = false;

import type { APIContext } from 'astro';
import pg from 'pg';
const { Client } = pg;

export async function POST({ request }: APIContext) {
  try {
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${import.meta.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY}`;
    
    if (!authHeader || authHeader !== expectedAuth) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { ids, status } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'IDs array is required and must not be empty'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid status. Must be: pending, approved, or rejected'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const connectionString = 
      import.meta.env.POSTGRES_URL_NON_POOLING || 
      import.meta.env.POSTGRES_PRISMA_URL || 
      import.meta.env.POSTGRES_URL ||
      import.meta.env.DATABASE_URL ||
      process.env.POSTGRES_URL_NON_POOLING || 
      process.env.POSTGRES_PRISMA_URL || 
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL;

    if (!connectionString) {
      return new Response(
        JSON.stringify({ success: false, message: 'Database configuration error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const client = new Client({
      connectionString: connectionString,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    // Build placeholders for IN clause
    const placeholders = ids.map((_, index) => `$${index + 2}`).join(', ');
    const query = `
      UPDATE alumni_registrations 
      SET status = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id IN (${placeholders})
      RETURNING id, name, status
    `;

    const result = await client.query(query, [status, ...ids]);

    await client.end();

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully updated ${result.rows.length} registration(s) to ${status}`,
        data: result.rows
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Bulk update error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'An error occurred while updating registrations',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}