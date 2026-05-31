export const prerender = false;

import type { APIRoute } from 'astro';
import { isAlumniAuthenticated, getCurrentAlumni } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';
import { ObjectId } from 'mongodb';

function generateSlug(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

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
    const alumniCol = db.collection('alumni_registrations');

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

    // All requests I sent (any status)
    const sentRequests = await connectionsCol
      .find({ requesterId: session.alumniId })
      .sort({ createdAt: -1 })
      .toArray();

    // Requests I declined (where I am the target and status declined)
    const declinedByMe = await connectionsCol
      .find({ targetId: session.alumniId, status: 'declined' })
      .sort({ updatedAt: -1 })
      .toArray();

    // Collect all alumni IDs to enrich
    const idsToFetch = new Set<string>();
    for (const conn of accepted) {
      const otherId = conn.requesterId === session.alumniId ? conn.targetId : conn.requesterId;
      if (otherId) idsToFetch.add(otherId);
    }
    for (const conn of sentRequests) {
      if (conn.targetId) idsToFetch.add(conn.targetId);
    }
    for (const conn of pendingIncoming) {
      if (conn.requesterId) idsToFetch.add(conn.requesterId);
    }
    for (const conn of declinedByMe) {
      if (conn.requesterId) idsToFetch.add(conn.requesterId);
    }

    // Batch fetch alumni profiles
    const alumniProfiles: Record<string, any> = {};
    if (idsToFetch.size > 0) {
      const objectIds: ObjectId[] = [];
      for (const id of idsToFetch) {
        try { objectIds.push(new ObjectId(id)); } catch { /* skip invalid */ }
      }
      if (objectIds.length > 0) {
        const profiles = await alumniCol
          .find({ _id: { $in: objectIds } })
          .project({ name: 1, slug: 1, faculty: 1, year: 1, job_designation: 1, position: 1, company: 1, location: 1, open_to_mentorship: 1 })
          .toArray();
        for (const p of profiles) {
          alumniProfiles[p._id.toString()] = {
            ...p,
            slug: p.slug || generateSlug(p.name || ''),
          };
        }
      }
    }

    function enrichConn(conn: any, otherId: string) {
      const profile = alumniProfiles[otherId] || null;
      return {
        ...conn,
        _id: conn._id.toString(),
        otherAlumni: profile
          ? {
              _id: otherId,
              name: profile.name || '',
              slug: profile.slug || '',
              faculty: profile.faculty || '',
              year: profile.year || '',
              job_designation: profile.job_designation || profile.position || '',
              company: profile.company || '',
              location: profile.location || '',
              open_to_mentorship: !!profile.open_to_mentorship,
            }
          : null,
      };
    }

    const enrichedAccepted = accepted.map((conn) => {
      const otherId = conn.requesterId === session.alumniId ? conn.targetId : conn.requesterId;
      return enrichConn(conn, otherId);
    });
    const enrichedSent = sentRequests.map((conn) => enrichConn(conn, conn.targetId));
    const enrichedPending = pendingIncoming.map((conn) => enrichConn(conn, conn.requesterId));
    const enrichedDeclined = declinedByMe.map((conn) => enrichConn(conn, conn.requesterId));

    return new Response(
      JSON.stringify({
        success: true,
        connections: enrichedAccepted,
        pendingIncoming: enrichedPending,
        sentRequests: enrichedSent,
        declinedByMe: enrichedDeclined,
      }),
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
