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

  const targetId = (body.targetId || '').trim();
  const message = (body.message || '').trim();

  if (!targetId) {
    return new Response(
      JSON.stringify({ success: false, message: 'targetId is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!message || message.length > 500) {
    return new Response(
      JSON.stringify({ success: false, message: 'Message must be between 1 and 500 characters' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { db } = await connectToDatabase();
    const connectionsCol = db.collection('connection_requests');
    const alumniCol = db.collection('alumni_registrations');
    const messagesCol = db.collection('connection_messages');

    const acceptedConnection = await connectionsCol.findOne({
      status: 'accepted',
      $or: [
        { requesterId: session.alumniId, targetId },
        { requesterId: targetId, targetId: session.alumniId },
      ],
    });

    if (!acceptedConnection) {
      return new Response(
        JSON.stringify({ success: false, message: 'You can only message accepted connections' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let target = null;
    try {
      target = await alumniCol.findOne({ _id: new ObjectId(targetId) }, { projection: { name: 1 } });
    } catch {
      target = null;
    }

    if (!target) {
      return new Response(
        JSON.stringify({ success: false, message: 'Target alumni not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    await messagesCol.insertOne({
      senderId: session.alumniId,
      senderName: session.name,
      recipientId: targetId,
      recipientName: target.name || '',
      message,
      sentAt: now,
      read: false,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Send connection message error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Failed to send message' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
