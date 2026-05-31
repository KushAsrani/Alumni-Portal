export const prerender = false;

import type { APIRoute } from 'astro';
import { authenticateAlumni, createTwoFATempToken, setAlumniAuthCookie } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password.trim() : '';

    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, message: 'Username/email and password are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await authenticateAlumni(username, password);

    if (!result.success || !result.alumni) {
      return new Response(JSON.stringify({ success: false, message: result.message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const alumni = result.alumni;

    try {
      const { db } = await connectToDatabase();
      const engagementCol = db.collection('alumni_engagement');
      await engagementCol.insertOne({
        type: 'login',
        alumniId: alumni._id.toString(),
        alumniName: alumni.name,
        status: 'completed',
        createdAt: new Date(),
      });
    } catch (error) {
      console.error('Alumni login engagement error:', error);
    }

    if (alumni.two_fa_enabled) {
      return new Response(JSON.stringify({ success: true, requires2FA: true, tempToken: createTwoFATempToken(alumni._id.toString()) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    setAlumniAuthCookie(cookies, alumni._id.toString(), alumni.username || alumni.email, alumni.name, alumni.photo_blob_url);

    return new Response(JSON.stringify({
      success: true,
      message: 'Login successful',
      data: {
        name: alumni.name,
        username: alumni.username,
        photo_blob_url: alumni.photo_blob_url,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Alumni login error:', error);
    return new Response(JSON.stringify({ success: false, message: 'An error occurred during login' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
