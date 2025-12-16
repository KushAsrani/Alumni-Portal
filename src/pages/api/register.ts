// src/pages/api/register.ts
import type { APIRoute } from 'astro';
import { sql } from '@vercel/postgres';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Parse request body
    const body = await request.json();
    const { name, email, year, faculty, degree, linkedin, photo, short_bio } = body;

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

    // Check if email already exists
    const existingUser = await sql`
      SELECT id FROM alumni_registrations 
      WHERE email = ${email}
    `;

    if (existingUser.rows.length > 0) {
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
    const result = await sql`
      INSERT INTO alumni_registrations (
        name, email, year, faculty, degree, linkedin, photo, short_bio
      )
      VALUES (
        ${name}, 
        ${email}, 
        ${year || null}, 
        ${faculty || null}, 
        ${degree || null}, 
        ${linkedin || null}, 
        ${photo || null}, 
        ${short_bio || null}
      )
      RETURNING id, name, email, created_at
    `;

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

  } catch (error) {
    console.error('Registration error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'An error occurred while processing your registration'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

// GET endpoint for admin (optional)
export const GET: APIRoute = async ({ request }) => {
  try {
    // Check authentication
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${import.meta.env.ADMIN_API_KEY}`;
    
    if (!authHeader || authHeader !== expectedAuth) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all registrations
    const registrations = await sql`
      SELECT id, name, email, year, faculty, degree, linkedin, photo, short_bio, status, created_at
      FROM alumni_registrations
      ORDER BY created_at DESC
    `;

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