export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../lib/db/services/eventService';

/**
 * Validate UUID token format before using it in check-in queries.
 */
function isUuidV4Format(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const POST: APIRoute = async ({ request, params, url }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = url.searchParams.get('token');
    if (token) {
      if (!isUuidV4Format(token)) {
        return new Response(JSON.stringify({ success: false, message: 'Invalid token format' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const success = await EventService.checkInByToken(eventId, token);
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

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { eventId } = params;
    const token = url.searchParams.get('token');
    if (!eventId || !token) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId or token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!isUuidV4Format(token)) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid token format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const success = await EventService.checkInByToken(eventId, token);
    return new Response(
      JSON.stringify({
        success,
        message: success ? 'Checked in successfully' : 'RSVP not found or not confirmed',
      }),
      {
        status: success ? 200 : 404,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error during token check-in:', error);
    return new Response(JSON.stringify({ success: false, message: 'Check-in failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
