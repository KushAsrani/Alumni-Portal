export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../lib/db/services/eventService';

export const GET: APIRoute = async ({ params }) => {
  const { seriesId } = params;
  if (!seriesId) {
    return new Response(JSON.stringify({ error: 'Missing seriesId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const events = await EventService.getSeriesEvents(seriesId);
    return new Response(
      JSON.stringify({
        success: true,
        events: events.map(e => ({
          ...e,
          _id: e._id?.toString(),
          seriesId: e.seriesId?.toString(),
          parentEventId: e.parentEventId?.toString(),
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
