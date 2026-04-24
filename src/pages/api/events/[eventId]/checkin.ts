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
    const { userEmail } = body;

    if (!userEmail) {
      return new Response(JSON.stringify({ success: false, message: 'Missing userEmail' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const success = await EventService.checkIn(eventId, userEmail);

    if (!success) {
      return new Response(
        JSON.stringify({ success: false, message: 'RSVP not found or not confirmed' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Checked in successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error during check-in:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
