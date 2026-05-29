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

  let body: { targetId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { targetId, message } = body;

  if (!targetId) {
    return new Response(
      JSON.stringify({ success: false, message: 'targetId is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Prevent self-connection
  if (targetId === session.alumniId) {
    return new Response(
      JSON.stringify({ success: false, message: 'You cannot connect with yourself' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { db } = await connectToDatabase();
    const connectionsCol = db.collection('connection_requests');

    // Check for existing pending/accepted connection
    const existing = await connectionsCol.findOne({
      $or: [
        { requesterId: session.alumniId, targetId, status: { $in: ['pending', 'accepted'] } },
        { requesterId: targetId, targetId: session.alumniId, status: { $in: ['pending', 'accepted'] } },
      ],
    });

    if (existing) {
      return new Response(
        JSON.stringify({ success: false, message: 'A connection request already exists' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Look up target alumni name
    const alumniCol = db.collection('alumni_registrations');
    let target = null;
    try {
      target = await alumniCol.findOne({ _id: new ObjectId(targetId) });
    } catch {
      // ignore invalid ObjectId
    }

    const now = new Date();
    const insertResult = await connectionsCol.insertOne({
      requesterId: session.alumniId,
      requesterName: session.name,
      requesterEmail: '',
      targetId,
      targetName: target?.name || '',
      message: message || '',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    // Fire-and-forget engagement tracking
    try {
      const engagementCol = db.collection('alumni_engagement');
      await engagementCol.insertOne({
        type: 'connection_request',
        alumniId: session.alumniId,
        alumniName: session.name,
        targetAlumniId: targetId,
        targetAlumniName: target?.name || '',
        status: 'pending',
        createdAt: now,
      });
    } catch {
      // silently ignore - tracking must never break main functionality
    }

    return new Response(
      JSON.stringify({ success: true, requestId: insertResult.insertedId.toString() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Connection request error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Failed to send connection request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
