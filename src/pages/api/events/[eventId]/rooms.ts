export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../lib/db/services/eventService';

export const GET: APIRoute = async ({ params }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rooms = await EventService.getRooms(eventId);

    return new Response(
      JSON.stringify({
        success: true,
        rooms: rooms.map(r => ({
          ...r,
          _id: r._id?.toString(),
          eventId: r.eventId.toString(),
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching rooms:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

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
    const { name, topic } = body;

    if (!name) {
      return new Response(JSON.stringify({ success: false, message: 'Missing room name' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const room = await EventService.createNetworkingRoom(eventId, name, topic);

    return new Response(
      JSON.stringify({
        success: true,
        room: { ...room, _id: room._id?.toString(), eventId: room.eventId.toString() },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating room:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
