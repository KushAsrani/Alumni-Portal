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

  let body: { requestId?: string; action?: 'accept' | 'decline'; response?: string; scheduledAt?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { requestId, action, response: mentorResponse, scheduledAt } = body;

  if (!requestId || !action || !['accept', 'decline'].includes(action)) {
    return new Response(
      JSON.stringify({ success: false, message: 'requestId and action (accept|decline) are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { db } = await connectToDatabase();
    const mentorshipCol = db.collection('mentorship_requests');

    let mentorshipRequest = null;
    try {
      mentorshipRequest = await mentorshipCol.findOne({ _id: new ObjectId(requestId) });
    } catch {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid request ID' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!mentorshipRequest) {
      return new Response(
        JSON.stringify({ success: false, message: 'Mentorship request not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Only the mentor can respond
    if (mentorshipRequest.mentorId !== session.alumniId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Only the mentor can respond to this request' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      status: action === 'accept' ? 'accepted' : 'declined',
      mentorResponse: mentorResponse || null,
      updatedAt: now,
    };

    if (action === 'accept' && scheduledAt) {
      updateData.scheduledAt = new Date(scheduledAt);
    }

    await mentorshipCol.updateOne(
      { _id: new ObjectId(requestId) },
      { $set: updateData }
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Mentorship respond error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Failed to respond to mentorship request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
