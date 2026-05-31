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
        JSON.stringify({ success: false, message: 'Connection not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify the caller is either the requester or the target
    if (connection.requesterId !== session.alumniId && connection.targetId !== session.alumniId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Not authorised to remove this connection' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    await connectionsCol.updateOne(
      { _id: new ObjectId(connectionId) },
      { $set: { status: 'removed', updatedAt: now } }
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Remove connection error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Failed to remove connection' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
