export const prerender = false;

import type { APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import { isAlumniAuthenticated, getCurrentAlumni } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';
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
    const body = await request.json().catch((error) => {
      console.error('GDPR delete parse error:', error);
      return {};
    });
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (!session) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    let alumni = null;
    try {
      alumni = await collection.findOne({ _id: new ObjectId(session.alumniId) });
    } catch (error) {
      console.error('GDPR delete ObjectId fallback:', error);
      alumni = await collection.findOne({ $or: [{ username: session.username }, { email: session.username }] });
    }

    if (!alumni) {
      return new Response(JSON.stringify({ success: false, message: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const update = {
      gdpr_deletion_requested: true,
      gdpr_deletion_requested_at: new Date(),
      gdpr_deletion_request_reason: reason || undefined,
      updated_at: new Date(),
    };

    await collection.updateOne({ _id: alumni._id }, { $set: update });
    await recordProfileUpdate(session.alumniId, alumni.email, alumni, { ...alumni, ...update }, 'alumni');

    return new Response(JSON.stringify({ success: true, message: 'Deletion request submitted successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('GDPR delete request error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Failed to submit deletion request' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
