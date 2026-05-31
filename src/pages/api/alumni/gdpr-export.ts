export const prerender = false;

import type { APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import { isAlumniAuthenticated, getCurrentAlumni } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';
import { getProfileHistory } from '../../../lib/profile-history';

export const GET: APIRoute = async ({ cookies }) => {
  if (!isAlumniAuthenticated(cookies)) {
    return new Response(JSON.stringify({ message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const session = getCurrentAlumni(cookies);
    if (!session) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    let alumni = null;
    try {
      alumni = await collection.findOne({ _id: new ObjectId(session.alumniId) });
    } catch (error) {
      console.error('GDPR export ObjectId fallback:', error);
      alumni = await collection.findOne({ $or: [{ username: session.username }, { email: session.username }] });
    }

    if (!alumni) {
      return new Response(JSON.stringify({ message: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { password_hash, two_fa_secret, two_fa_backup_codes, ...sanitizedAlumni } = alumni;
    const profileHistory = await getProfileHistory(session.alumniId, 200);
    const fileName = `my-data-${new Date().toISOString().split('T')[0]}.json`;

    return new Response(JSON.stringify({ profile: sanitizedAlumni, profileHistory }, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('GDPR export error:', error);
    return new Response(JSON.stringify({ message: 'Failed to export data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
