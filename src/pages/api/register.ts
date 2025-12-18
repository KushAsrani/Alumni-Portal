export const prerender = false;

import type { APIRoute } from 'astro';
import pg from 'pg';
const { Client } = pg;

export const POST: APIRoute = async ({ request }) => {
  try {
    // Log request details for debugging
    console.log('Content-Type:', request.headers.get('content-type'));
    
    // Get the raw body text first
    const bodyText = await request.text();
    console.log('Raw body:', bodyText);
    
    // Try to parse as JSON
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      console.error('JSON parse error:', e);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid request format'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const { name, email, year, faculty, degree, linkedin, photo, short_bio } = body;

    console.log('Parsed data:', { name, email, year, faculty, degree });

    // Validate required fields
    if (!name || !email) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Name and email are required'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid email format'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Get connection string from environment
    // Get connection string from environment
const connectionString = 
  import.meta.env.POSTGRES_URL_NON_POOLING || 
  import.meta.env.POSTGRES_PRISMA_URL || 
  import.meta.env.POSTGRES_URL ||
  import.meta.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING || 
  process.env.POSTGRES_PRISMA_URL || 
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;

console.log('Connection string found:', !!connectionString);

if (!connectionString) {
  console.error('Database connection string not found');
  console.log('Available env vars:', Object.keys(import.meta.env));
  return new Response(
    JSON.stringify({
      success: false,
      message: 'Database configuration error'
    }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
    // Create database client
    const client = new Client({
      connectionString: connectionString,
      ssl: {
        rejectUnauthorized: false
      }
    });

    await client.connect();
    console.log('Database connected');

    try {
      // Check if email already exists
      const existingUser = await client.query(
        'SELECT id FROM alumni_registrations WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        await client.end();
        return new Response(
          JSON.stringify({
            success: false,
            message: 'This email is already registered'
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Insert new registration
      const result = await client.query(
        `INSERT INTO alumni_registrations (
          name, email, year, faculty, degree, linkedin, photo, short_bio
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, name, email, created_at`,
        [name, email, year || null, faculty || null, degree || null, linkedin || null, photo || null, short_bio || null]
      );

      await client.end();
      console.log('Registration successful:', result.rows[0]);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Registration submitted successfully',
          data: result.rows[0]
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (dbError) {
      await client.end();
      console.error('Database error:', dbError);
      throw dbError;
    }

  } catch (error) {
    console.error('Registration error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'An error occurred while processing your registration',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

export const GET: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${import.meta.env.ADMIN_API_KEY}`;
    
    if (!authHeader || authHeader !== expectedAuth) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
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

    const registrations = await client.query(
      `SELECT id, name, email, year, faculty, degree, linkedin, photo, short_bio, status, created_at
       FROM alumni_registrations
       ORDER BY created_at DESC`
    );

    await client.end();

    return new Response(
      JSON.stringify({
        success: true,
        data: registrations.rows
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Fetch registrations error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'An error occurred while fetching registrations'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};