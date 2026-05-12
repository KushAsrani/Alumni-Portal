export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../lib/db/services/eventService';

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const { eventId } = params;
    const body = await request.json();
    const referralCode = body?.referralCode ? String(body.referralCode) : '';

    if (!eventId || !referralCode) {
      return new Response(JSON.stringify({ success: false, message: 'Missing params' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await EventService.incrementReferralClick(eventId, referralCode);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
