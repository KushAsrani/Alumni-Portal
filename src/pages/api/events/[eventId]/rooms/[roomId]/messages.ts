export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../../../lib/db/services/eventService';

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { roomId } = params;
    if (!roomId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing roomId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const limit = parseInt(url.searchParams.get('limit') || '100');
    const messages = await EventService.getMessages(roomId, limit);

    return new Response(
      JSON.stringify({
        success: true,
        total: messages.length,
        messages: messages.map(m => ({
          ...m,
          _id: m._id?.toString(),
          roomId: m.roomId.toString(),
        })),
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
