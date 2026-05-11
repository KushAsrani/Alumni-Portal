export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../lib/db/services/eventService';

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { eventId } = params;
    const email = url.searchParams.get('email');

    if (!eventId || !email) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing eventId or email' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
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
