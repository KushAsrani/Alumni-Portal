export const prerender = false;

import type { APIContext } from 'astro';
import pg from 'pg';
const { Client } = pg;

export async function POST({ request }: APIContext) {
  try {
    const clonedRequest = request.clone();
    let bodyText = '';
    
    try {
      bodyText = await clonedRequest.text();
    } catch (e) {
      console.error('Failed to read body:', e);
    }
    
    console.log('Content-Type:', request.headers.get('content-type'));
    
    if (!bodyText) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Empty request body'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      console.error('JSON parse error:', e);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid JSON format'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const { 
      name, 
      email, 
      mobile,
      dob,
      gender,
      address,
      year, 
      faculty, 
      degree,
      university,
      job_designation,
      company,
      linkedin, 
      photo_blob_url,
      short_bio 
    } = body;

    console.log('Parsed data:', { name, email, mobile, gender, university });

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

    // Validate mobile number if provided
    if (mobile) {
      const mobileRegex = /^[+]?[\d\s\-()]{10,}$/;
      if (!mobileRegex.test(mobile)) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Invalid mobile number format'
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Get connection string
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
      console.error('Database connection string not found');
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

    const client = new Client({
      connectionString: connectionString,
      ssl: { rejectUnauthorized: false }
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
            message: 'Name or email is already registered please use a different name or email.'
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Insert new registration with all fields
      const result = await client.query(
        `INSERT INTO alumni_registrations (
          name, email, mobile, dob, gender, address,
          year, faculty, degree, university, job_designation, company,
          linkedin, photo_blob_url, short_bio
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id, name, email, created_at`,
        [
          name, 
          email, 
          mobile || null,
          dob || null,
          gender || null,
          address || null,
          year || null, 
          faculty || null, 
          degree || null,
          university || null,
          job_designation || null,
          company || null,
          linkedin || null, 
          photo_blob_url || null,
          short_bio || null
        ]
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
}

export async function GET({ request }: APIContext) {
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
      `SELECT 
        id, name, email, mobile, dob, gender, address,
        year, faculty, degree, university, job_designation, company,
        linkedin, photo_blob_url, short_bio, status, created_at
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
}