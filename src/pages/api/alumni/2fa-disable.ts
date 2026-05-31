export const prerender = false;

import type { APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import { isAlumniAuthenticated, getCurrentAlumni } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';
import { verifyTOTP } from '../../../lib/totp';
import { recordProfileUpdate } from '../../../lib/profile-history';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAlumniAuthenticated(cookies)) {
    return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const session = getCurrentAlumni(cookies);
    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token.trim() : '';

    if (!session || !token) {
      return new Response(JSON.stringify({ success: false, message: 'Verification code is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    let alumni = null;
    try {
      alumni = await collection.findOne({ _id: new ObjectId(session.alumniId) });
    } catch (error) {
      console.error('2FA disable ObjectId fallback:', error);
      alumni = await collection.findOne({ $or: [{ username: session.username }, { email: session.username }] });
    }

    if (!alumni?.two_fa_secret || !verifyTOTP(alumni.two_fa_secret, token)) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid verification code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const update = {
      two_fa_enabled: false,
      two_fa_secret: null,
      two_fa_backup_codes: [],
      updated_at: new Date(),
    };

    await collection.updateOne({ _id: alumni._id }, { $set: update });
    await recordProfileUpdate(session.alumniId, alumni.email, alumni, { ...alumni, ...update }, 'alumni');

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('2FA disable error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Failed to disable two-factor authentication' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
