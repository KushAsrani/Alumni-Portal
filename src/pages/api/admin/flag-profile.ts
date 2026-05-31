export const prerender = false;

import type { APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import { isAuthenticated, getCurrentUser } from '../../../lib/auth';
import { connectToDatabase } from '../../../lib/mongodb';
import { recordProfileUpdate } from '../../../lib/profile-history';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) {
    return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const alumniId = typeof body?.alumniId === 'string' ? body.alumniId.trim() : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const action = body?.action;

    if (!alumniId || (action !== 'flag' && action !== 'unflag') || (action === 'flag' && !reason)) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const currentUser = getCurrentUser(cookies);
    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    let query: Record<string, unknown> = { _id: null };
    try {
      query = { _id: new ObjectId(alumniId) };
    } catch (error) {
      console.error('Flag profile ObjectId fallback:', error);
      query = { $or: [{ username: alumniId }, { email: alumniId }] };
    }

    const existing = await collection.findOne(query);
    if (!existing) {
      return new Response(JSON.stringify({ success: false, message: 'Alumni not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const update =
      action === 'flag'
        ? {
            is_flagged: true,
            flag_reason: reason,
            flag_reported_at: new Date(),
            flag_reported_by: currentUser,
            flag_resolved: false,
            updated_at: new Date(),
          }
        : {
            is_flagged: false,
            flag_resolved: true,
            flag_resolved_at: new Date(),
            updated_at: new Date(),
          };

    await collection.updateOne({ _id: existing._id }, { $set: update });
    await recordProfileUpdate(existing._id.toString(), existing.email, existing, { ...existing, ...update }, 'admin');

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Flag profile error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Failed to update flag status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
