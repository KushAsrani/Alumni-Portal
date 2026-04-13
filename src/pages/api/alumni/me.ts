export const prerender = false;

import type { APIRoute } from 'astro';
import { getCurrentAlumni } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';
import { ObjectId } from 'mongodb';

export const GET: APIRoute = async ({ cookies }) => {
  const session = getCurrentAlumni(cookies);

  if (!session) {
    return new Response(
      JSON.stringify({ success: false, message: 'Not authenticated' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    let record = null;
    try {
      record = await collection.findOne({ _id: new ObjectId(session.alumniId) });
    } catch (err) {
      // BSONError / TypeError is expected for invalid ObjectId formats — fall back to username lookup.
      // Re-throw unexpected errors (e.g. connection failures) so the outer catch handles them.
      if (err instanceof Error && (err.name === 'BSONError' || err.name === 'BSONTypeError' || err.name === 'TypeError')) {
        record = await collection.findOne({
          $or: [
            { username: session.username },
            { email: session.username }
          ]
        });
      } else {
        throw err;
      }
    }

    if (!record) {
      return new Response(
        JSON.stringify({ success: false, message: 'Profile not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          name: record.name,
          email: record.email,
          username: record.username || record.email,
          photoUrl: record.photo_blob_url || session.photoUrl,
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Alumni me error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Failed to fetch profile' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
