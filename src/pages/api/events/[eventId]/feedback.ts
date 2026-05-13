export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../lib/db/services/eventService';

let indexesSetup = false;

async function ensureIndexes() {
  if (!indexesSetup) {
    indexesSetup = true;
    await EventService.setupIndexes().catch(err => console.error('[feedback] Index setup failed:', err));
  }
}

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await ensureIndexes();

    const userEmail = url.searchParams.get('userEmail');
    const summary = await EventService.getFeedbackSummary(eventId);

    const summaryResponse = {
      count: summary.count,
      avgRating: summary.avgRating,
      recommendPct: summary.recommendPct,
    };

    if (userEmail) {
      const userFeedback = await EventService.getUserFeedback(eventId, userEmail);
      return new Response(
        JSON.stringify({
          success: true,
          feedback: userFeedback
            ? {
                ...userFeedback,
                _id: userFeedback._id?.toString(),
                eventId: userFeedback.eventId.toString(),
              }
            : null,
          summary: summaryResponse,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, summary: summaryResponse }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[feedback] GET error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { userEmail, rating, wouldRecommend, highlights, improvements } = body;

    // Validate required fields
    if (!userEmail || typeof userEmail !== 'string' || userEmail.trim().length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'User email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return new Response(
        JSON.stringify({ success: false, message: 'Rating must be an integer between 1 and 5' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (typeof wouldRecommend !== 'boolean') {
      return new Response(
        JSON.stringify({ success: false, message: 'wouldRecommend must be a boolean' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify the event exists and has ended
    const event = await EventService.getEventById(eventId);
    if (!event) {
      return new Response(JSON.stringify({ success: false, message: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (event.status !== 'ended') {
      return new Response(
        JSON.stringify({ success: false, message: 'Feedback can only be submitted for ended events' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user has a confirmed RSVP with checkedIn === true
    const rsvp = await EventService.getRsvpByEmailAndEvent(eventId, userEmail.trim());
    if (!rsvp || rsvp.checkedIn !== true) {
      return new Response(
        JSON.stringify({ success: false, message: 'Feedback is only available to attendees who checked in at the event' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    await ensureIndexes();

    try {
      const feedback = await EventService.submitFeedback(eventId, userEmail.trim(), {
        rating,
        wouldRecommend,
        highlights: highlights || undefined,
        improvements: improvements || undefined,
      });

      return new Response(
        JSON.stringify({
          success: true,
          feedback: {
            ...feedback,
            _id: feedback._id?.toString(),
            eventId: feedback.eventId.toString(),
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err: any) {
      if (err?.message === 'You have already submitted feedback for this event.') {
        return new Response(
          JSON.stringify({ success: false, message: err.message }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('[feedback] POST error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
