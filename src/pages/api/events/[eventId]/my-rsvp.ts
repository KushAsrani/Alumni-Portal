export const prerender = false;

import type { APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import type { Filter } from 'mongodb';
import { getCurrentAlumni, isAlumniAuthenticated } from '../../../../lib/alumni-auth';
import { connectToDatabase } from '../../../../lib/mongodb';
import { EventService } from '../../../../lib/db/services/eventService';

export const GET: APIRoute = async ({ params, url, request, cookies }) => {
  try {
    const { eventId } = params;
    const email = url.searchParams.get('email');

    if (!eventId || !email) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing eventId or email' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${import.meta.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY}`;
    const isAdminRequest = !!authHeader && authHeader === expectedAuth;

    if (!isAdminRequest) {
      if (!isAlumniAuthenticated(cookies)) {
        return new Response(
          JSON.stringify({ success: false, message: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const currentAlumni = getCurrentAlumni(cookies);
      if (!currentAlumni) {
        return new Response(
          JSON.stringify({ success: false, message: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const requestedEmail = email.trim().toLowerCase();
      const username = currentAlumni.username?.trim().toLowerCase();
      if (requestedEmail !== username) {
        const { db } = await connectToDatabase();
        let query: Filter<{ _id: ObjectId; username: string; email: string }> = {
          $or: [{ username: currentAlumni.username }, { email: currentAlumni.username }],
        };
        if (currentAlumni.alumniId) {
          try {
            query = { _id: new ObjectId(currentAlumni.alumniId) };
          } catch {}
        }

        const profile = await db.collection('alumni_registrations').findOne(query, {
          projection: { email: 1 },
        });
        if ((profile?.email || '').trim().toLowerCase() !== requestedEmail) {
          return new Response(
            JSON.stringify({ success: false, message: 'Forbidden' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    const rsvp = await EventService.getRsvpByEmailAndEvent(eventId, email);
    if (!rsvp) {
      return new Response(
        JSON.stringify({ success: false, message: 'RSVP not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        rsvp: {
          ...rsvp,
          _id: rsvp._id?.toString(),
          eventId: rsvp.eventId.toString(),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
