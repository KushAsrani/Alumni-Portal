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

  let body: {
    mentorId?: string;
    goal?: string;
    topic?: string;
    duration?: string;
    message?: string;
    mode?: string;
    sessions?: string;
    preferredSchedule?: string;
    background?: string;
    focusSkills?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { mentorId, goal, topic, duration, message, mode, sessions, preferredSchedule, background, focusSkills } = body;

  if (!mentorId || !goal || !topic || !duration || !mode || !sessions) {
    return new Response(
      JSON.stringify({ success: false, message: 'mentorId, goal, topic, duration, mode, and sessions are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (goal.trim().length < 30) {
    return new Response(
      JSON.stringify({ success: false, message: 'Goal must be at least 30 characters long' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if ((message || '').trim().length > 500) {
    return new Response(
      JSON.stringify({ success: false, message: 'Personal message cannot exceed 500 characters' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Prevent self-mentorship
  if (mentorId === session.alumniId) {
    return new Response(
      JSON.stringify({ success: false, message: 'You cannot request mentorship from yourself' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { db } = await connectToDatabase();
    const alumniCol = db.collection('alumni_registrations');

    // Look up mentor
    let mentor = null;
    try {
      mentor = await alumniCol.findOne({ _id: new ObjectId(mentorId), open_to_mentorship: true, status: 'approved' });
    } catch {
      mentor = await alumniCol.findOne({ open_to_mentorship: true, status: 'approved', username: mentorId });
    }

    if (!mentor) {
      return new Response(
        JSON.stringify({ success: false, message: 'Mentor not found or not open to mentorship' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Look up mentee (current user)
    let mentee = null;
    try {
      mentee = await alumniCol.findOne({ _id: new ObjectId(session.alumniId) });
    } catch {
      mentee = await alumniCol.findOne({
        $or: [{ username: session.username }, { email: session.username }],
      });
    }

    const now = new Date();
    const mentorshipCol = db.collection('mentorship_requests');
    const insertResult = await mentorshipCol.insertOne({
      menteeId: session.alumniId,
      menteeName: session.name,
      menteeEmail: mentee?.email || '',
      mentorId: mentor._id.toString(),
      mentorName: mentor.name,
      goal,
      topic,
      duration,
      mode,
      sessions,
      preferredSchedule: (preferredSchedule || '').trim(),
      background: (background || '').trim(),
      focusSkills: Array.isArray(focusSkills) ? focusSkills.filter(Boolean).slice(0, 20) : [],
      message: message || '',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      scheduledAt: null,
      mentorResponse: null,
    });

    // Fire-and-forget engagement tracking
    try {
      const engagementCol = db.collection('alumni_engagement');
      await engagementCol.insertOne({
        type: 'mentorship_booking',
        alumniId: session.alumniId,
        alumniName: session.name,
        targetAlumniId: mentor._id.toString(),
        targetAlumniName: mentor.name,
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
    console.error('Mentorship request error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Failed to submit mentorship request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
