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
    const connectionsCol = db.collection('connection_requests');

    // Accepted connections where I am requester or target
    const accepted = await connectionsCol
      .find({
        $or: [
          { requesterId: session.alumniId, status: 'accepted' },
          { targetId: session.alumniId, status: 'accepted' },
        ],
      })
      .sort({ updatedAt: -1 })
      .toArray();

    // Pending incoming requests where I am the target
    const pendingIncoming = await connectionsCol
      .find({ targetId: session.alumniId, status: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();

    return new Response(
      JSON.stringify({ success: true, connections: accepted, pendingIncoming }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Fetch connections error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Failed to fetch connections' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
