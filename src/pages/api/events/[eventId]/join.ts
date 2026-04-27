export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../lib/db/services/eventService';

/**
 * GET /api/events/:eventId/join
 *
 * Server-side redirect to the meetingUrl. The raw URL is never exposed to the
 * browser in the page HTML — it is only revealed via this redirect when
 * meetingUrlActive is true.  Existing events with meetingUrlActive: undefined
 * are treated as inactive (falsy), consistent with the model default.
 */
export const GET: APIRoute = async ({ params }) => {
  const { eventId } = params;
  if (!eventId) {
    return new Response(JSON.stringify({ success: false, error: 'Missing eventId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const event = await EventService.getEventById(eventId);

    if (!event) {
      return new Response(JSON.stringify({ success: false, error: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!event.meetingUrl) {
      return new Response(JSON.stringify({ success: false, error: 'No meeting URL configured for this event' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (event.meetingUrlActive !== true) {
      return new Response(JSON.stringify({ success: false, error: 'Join link is not yet active' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate that the stored URL uses http/https before redirecting
    let safeUrl: string;
    try {
      // Explicit protocol allowlist check before constructing URL object
      if (!/^https?:\/\//i.test(event.meetingUrl)) {
        throw new Error('Invalid protocol');
      }
      const u = new URL(event.meetingUrl);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        throw new Error('Invalid protocol');
      }
      safeUrl = u.toString();
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'Invalid meeting URL' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: safeUrl },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
