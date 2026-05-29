export const prerender = false;

import type { APIRoute } from 'astro';
import { isAlumniAuthenticated, getCurrentAlumni } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';

export const GET: APIRoute = async ({ cookies }) => {
  if (!isAlumniAuthenticated(cookies)) {
    return new Response(
      JSON.stringify({ success: false, message: 'Not authenticated' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const session = getCurrentAlumni(cookies)!;

  try {
    const { db } = await connectToDatabase();
    const mentorshipCol = db.collection('mentorship_requests');

    const requests = await mentorshipCol
      .find({
        $or: [{ menteeId: session.alumniId }, { mentorId: session.alumniId }],
      })
      .sort({ createdAt: -1 })
      .toArray();

    return new Response(JSON.stringify({ success: true, requests }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Fetch mentorship requests error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Failed to fetch mentorship requests' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
