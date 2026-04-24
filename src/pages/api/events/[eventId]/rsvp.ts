export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../lib/db/services/eventService';

export const POST: APIRoute = async ({ request, params }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { userEmail, userName } = body;

    if (!userEmail) {
      return new Response(JSON.stringify({ success: false, message: 'Missing userEmail' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await EventService.rsvp(eventId, userEmail, userName);

    return new Response(
      JSON.stringify({
        success: true,
        status: result.status,
        rsvp: { ...result.rsvp, _id: result.rsvp._id?.toString(), eventId: result.rsvp.eventId.toString() },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Duplicate key error means already RSVP'd
    const isDuplicate = message.includes('duplicate key') || message.includes('E11000');
    return new Response(
      JSON.stringify({
        success: false,
        message: isDuplicate ? 'Already RSVP\'d for this event' : message,
      }),
      { status: isDuplicate ? 409 : 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { userEmail } = body;

    if (!userEmail) {
      return new Response(JSON.stringify({ success: false, message: 'Missing userEmail' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await EventService.cancelRsvp(eventId, userEmail);

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, message }),
      { status: message === 'RSVP not found' ? 404 : 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
