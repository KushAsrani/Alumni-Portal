export const prerender = false;

import type { APIRoute } from 'astro';
import { ReminderService } from '../../../../lib/db/services/reminderService';

// GET: check if the current user is subscribed
export const GET: APIRoute = async ({ params, url }) => {
  const { eventId } = params;
  const userEmail = url.searchParams.get('userEmail');
  if (!eventId || !userEmail) {
    return new Response(JSON.stringify({ success: false, message: 'Missing eventId or userEmail' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  const subscribed = await ReminderService.isSubscribed(eventId, userEmail);
  return new Response(JSON.stringify({ success: true, subscribed }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

// POST: subscribe
export const POST: APIRoute = async ({ params, request }) => {
  const { eventId } = params;
  const body = await request.json();
  const { userEmail, userName } = body;
  if (!eventId || !userEmail) {
    return new Response(JSON.stringify({ success: false, message: 'Missing eventId or userEmail' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  await ReminderService.subscribeNotifyMe(eventId, userEmail, userName);
  return new Response(JSON.stringify({ success: true, subscribed: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

// DELETE: unsubscribe
export const DELETE: APIRoute = async ({ params, request }) => {
  const { eventId } = params;
  const body = await request.json();
  const { userEmail } = body;
  if (!eventId || !userEmail) {
    return new Response(JSON.stringify({ success: false, message: 'Missing eventId or userEmail' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  await ReminderService.unsubscribeNotifyMe(eventId, userEmail);
  return new Response(JSON.stringify({ success: true, subscribed: false }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
