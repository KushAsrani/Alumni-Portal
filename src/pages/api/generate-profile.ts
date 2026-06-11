export const prerender = false;

import type { APIContext } from 'astro';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../../lib/mongodb';
import {
  ALUMNI_PROFILES_COLLECTION,
  generateProfileSlug,
  upsertAlumniProfileFromRegistration,
} from '../../lib/alumni-profile-service';

export async function POST({ request }: APIContext) {
  try {
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${import.meta.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY}`;

    if (!authHeader || authHeader !== expectedAuth) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const body = await request.json();
    const { id } = body;

    if (!id || !ObjectId.isValid(id)) {
      return new Response(
        JSON.stringify({ success: false, message: 'A valid registration ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { db } = await connectToDatabase();
    const registrations = db.collection('alumni_registrations');

    const registration = await registrations.findOne({ _id: new ObjectId(id) });

    if (!registration) {
      return new Response(
        JSON.stringify({ success: false, message: 'Registration not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (registration.status !== 'approved') {
      return new Response(
        JSON.stringify({ success: false, message: 'Only approved registrations can be saved as alumni profiles' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const slug = registration.slug || generateProfileSlug(registration.name || '');
    const profile = await upsertAlumniProfileFromRegistration({ ...registration, slug });

    await registrations.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          slug,
          profile_generated: true,
          profile_collection: ALUMNI_PROFILES_COLLECTION,
          alumni_profile_id: profile?._id,
          updated_at: new Date(),
        },
      },
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Alumni profile saved to MongoDB ${ALUMNI_PROFILES_COLLECTION} collection`,
        data: {
          collection: ALUMNI_PROFILES_COLLECTION,
          profileId: profile?._id?.toString(),
          slug,
          path: `/alumni/profiles/${slug}`,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Profile generation error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        message: 'An error occurred while saving the alumni profile',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
