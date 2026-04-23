export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../lib/db/services/eventService';

export const GET: APIRoute = async ({ url, params }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const status = url.searchParams.get('status') || undefined;
    const rsvps = await EventService.getRsvps(eventId, status);

    return new Response(
      JSON.stringify({
        success: true,
        total: rsvps.length,
        rsvps: rsvps.map(r => ({
          ...r,
          _id: r._id?.toString(),
          eventId: r.eventId.toString(),
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching RSVPs:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
