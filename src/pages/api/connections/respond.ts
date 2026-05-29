export const prerender = false;

import type { APIRoute } from 'astro';
import { isAlumniAuthenticated, getCurrentAlumni } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';
import { ObjectId } from 'mongodb';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAlumniAuthenticated(cookies)) {
    return new Response(
      JSON.stringify({ success: false, message: 'Not authenticated' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const session = getCurrentAlumni(cookies)!;

  let body: { requestId?: string; action?: 'accept' | 'decline' };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { requestId, action } = body;

  if (!requestId || !action || !['accept', 'decline'].includes(action)) {
    return new Response(
      JSON.stringify({ success: false, message: 'requestId and action (accept|decline) are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { db } = await connectToDatabase();
    const connectionsCol = db.collection('connection_requests');

    let connectionRequest = null;
    try {
      connectionRequest = await connectionsCol.findOne({ _id: new ObjectId(requestId) });
    } catch {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid request ID' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!connectionRequest) {
      return new Response(
        JSON.stringify({ success: false, message: 'Connection request not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Only the target can respond
    if (connectionRequest.targetId !== session.alumniId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Only the target alumni can respond to this request' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    const now = new Date();

    await connectionsCol.updateOne(
      { _id: new ObjectId(requestId) },
      { $set: { status: newStatus, updatedAt: now } }
    );

    // Update engagement record status
    try {
      const engagementCol = db.collection('alumni_engagement');
      await engagementCol.updateOne(
        {
          type: 'connection_request',
          alumniId: connectionRequest.requesterId,
          targetAlumniId: session.alumniId,
        },
        { $set: { status: newStatus } }
      );
    } catch {
      // silently ignore
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Connection respond error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Failed to respond to connection request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
