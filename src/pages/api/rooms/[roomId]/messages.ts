export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../lib/db/services/eventService';

export const GET: APIRoute = async ({ url, params }) => {
  try {
    const { roomId } = params;
    if (!roomId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing roomId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const limit = parseInt(url.searchParams.get('limit') || '50');
    const messages = await EventService.getMessages(roomId, limit);

    return new Response(
      JSON.stringify({
        success: true,
        messages: messages.map(m => ({
          ...m,
          _id: m._id?.toString(),
          roomId: m.roomId.toString(),
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching messages:', error);
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
    const { roomId } = params;
    if (!roomId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing roomId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { userEmail, userName, message } = body;

    if (!userEmail || !message) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing required fields: userEmail, message' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const msg = await EventService.postMessage(roomId, userEmail, userName, message);

    return new Response(
      JSON.stringify({
        success: true,
        message: { ...msg, _id: msg._id?.toString(), roomId: msg.roomId.toString() },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error posting message:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
