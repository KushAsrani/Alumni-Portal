export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../../lib/db/services/eventService';

export const PATCH: APIRoute = async ({ request, params }) => {
  try {
    const { roomId } = params;
    if (!roomId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing roomId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const updates: { name?: string; topic?: string; isActive?: boolean } = {};
    if ('name' in body) updates.name = body.name;
    if ('topic' in body) updates.topic = body.topic;
    if ('isActive' in body) updates.isActive = Boolean(body.isActive);

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'No valid fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const success = await EventService.updateRoom(roomId, updates);

    if (!success) {
      return new Response(
        JSON.stringify({ success: false, message: 'Room not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Room updated' }),
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

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const { roomId } = params;
    if (!roomId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing roomId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const success = await EventService.deleteRoom(roomId);

    if (!success) {
      return new Response(
        JSON.stringify({ success: false, message: 'Room not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Room deleted' }),
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
