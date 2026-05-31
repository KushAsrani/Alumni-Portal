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

function parseObjectId(id: string) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
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

    const [accepted, pendingIncoming, sentRequests, declinedByMe, removedConnections] = await Promise.all([
      connectionsCol
        .find({
          status: 'accepted',
          $or: [{ requesterId: session.alumniId }, { targetId: session.alumniId }],
        })
        .sort({ acceptedAt: -1, updatedAt: -1 })
        .toArray(),
      connectionsCol
        .find({ targetId: session.alumniId, status: 'pending' })
        .sort({ createdAt: -1 })
        .toArray(),
      connectionsCol
        .find({ requesterId: session.alumniId })
        .sort({ createdAt: -1 })
        .toArray(),
      connectionsCol
        .find({ targetId: session.alumniId, status: 'declined' })
        .sort({ declinedAt: -1, updatedAt: -1 })
        .toArray(),
      connectionsCol
        .find({
          status: 'removed',
          $or: [{ requesterId: session.alumniId }, { targetId: session.alumniId }],
        })
        .sort({ removedAt: -1, updatedAt: -1 })
        .toArray(),
    ]);

    const idsToFetch = new Set<string>();
    const collectOtherIds = (items: any[], idSelector: (item: any) => string | undefined) => {
      for (const item of items) {
        const id = idSelector(item);
        if (id && id !== session.alumniId) idsToFetch.add(id);
      }
    };

    collectOtherIds(accepted, (conn) => (conn.requesterId === session.alumniId ? conn.targetId : conn.requesterId));
    collectOtherIds(pendingIncoming, (conn) => conn.requesterId);
    collectOtherIds(sentRequests, (conn) => conn.targetId);
    collectOtherIds(declinedByMe, (conn) => conn.requesterId);
    collectOtherIds(removedConnections, (conn) => (conn.requesterId === session.alumniId ? conn.targetId : conn.requesterId));

    const currentObjectId = parseObjectId(session.alumniId);
    let currentProfile: any = null;
    if (currentObjectId) {
      currentProfile = await alumniCol.findOne({ _id: currentObjectId }, { projection: { skills: 1 } });
    }
    if (!currentProfile) {
      currentProfile = await alumniCol.findOne(
        { $or: [{ username: session.username }, { email: session.username }] },
        { projection: { skills: 1 } }
      );
    }
    const mySkills = Array.isArray(currentProfile?.skills)
      ? currentProfile.skills.filter((skill: unknown) => typeof skill === 'string')
      : [];

    const alumniProfiles: Record<string, any> = {};
    const objectIds = Array.from(idsToFetch)
      .map((id) => parseObjectId(id))
      .filter(Boolean) as ObjectId[];

    if (objectIds.length > 0) {
      const profiles = await alumniCol
        .find({ _id: { $in: objectIds } })
        .project({
          name: 1,
          slug: 1,
          faculty: 1,
          year: 1,
          job_designation: 1,
          position: 1,
          company: 1,
          location: 1,
          open_to_mentorship: 1,
          skills: 1,
        })
        .toArray();

      for (const profile of profiles) {
        alumniProfiles[profile._id.toString()] = {
          _id: profile._id.toString(),
          name: profile.name || '',
          slug: profile.slug || generateSlug(profile.name || ''),
          faculty: profile.faculty || '',
          year: profile.year || '',
          job_designation: profile.job_designation || profile.position || '',
          company: profile.company || '',
          location: profile.location || '',
          open_to_mentorship: !!profile.open_to_mentorship,
          skills: Array.isArray(profile.skills)
            ? profile.skills.filter((skill: unknown) => typeof skill === 'string')
            : [],
        };
      }
    }

    const enrichConn = (conn: any, otherId: string) => {
      const profile = otherId ? alumniProfiles[otherId] || null : null;
      return {
        ...conn,
        _id: conn._id.toString(),
        otherAlumni: profile,
      };
    };

    const enrichedAccepted = accepted.map((conn) =>
      enrichConn(conn, conn.requesterId === session.alumniId ? conn.targetId : conn.requesterId)
    );
    const enrichedPending = pendingIncoming.map((conn) => enrichConn(conn, conn.requesterId));
    const enrichedSent = sentRequests.map((conn) => enrichConn(conn, conn.targetId));
    const enrichedDeclined = declinedByMe.map((conn) => enrichConn(conn, conn.requesterId));
    const enrichedRemoved = removedConnections.map((conn) =>
      enrichConn(conn, conn.requesterId === session.alumniId ? conn.targetId : conn.requesterId)
    );

    return new Response(
      JSON.stringify({
        success: true,
        mySkills,
        connections: enrichedAccepted,
        pendingIncoming: enrichedPending,
        sentRequests: enrichedSent,
        declinedByMe: enrichedDeclined,
        removedConnections: enrichedRemoved,
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
