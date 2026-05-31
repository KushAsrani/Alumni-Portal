export const prerender = false;

import type { APIRoute } from 'astro';
import { isAlumniAuthenticated, getCurrentAlumni } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';
import { ObjectId } from 'mongodb';

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!isAlumniAuthenticated(cookies)) {
    return new Response(
      JSON.stringify({ success: false, message: 'Not authenticated' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const session = getCurrentAlumni(cookies)!;

  let body: { connectionId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { connectionId } = body;
  if (!connectionId) {
    return new Response(
      JSON.stringify({ success: false, message: 'connectionId is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { db } = await connectToDatabase();
    const connectionsCol = db.collection('connection_requests');

    let connection = null;
    try {
      connection = await connectionsCol.findOne({ _id: new ObjectId(connectionId) });
    } catch {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid connection ID' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!connection) {
      return new Response(
        JSON.stringify({ success: false, message: 'Connection request not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Only the requester can cancel, and only if still pending
    if (connection.requesterId !== session.alumniId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Only the requester can cancel a connection request' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (connection.status !== 'pending') {
      return new Response(
        JSON.stringify({ success: false, message: 'Only pending requests can be cancelled' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    await connectionsCol.deleteOne({ _id: new ObjectId(connectionId) });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Cancel connection error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Failed to cancel connection request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
