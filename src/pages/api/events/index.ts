export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../lib/db/services/eventService';

export const GET: APIRoute = async ({ url }) => {
  try {
    const status = url.searchParams.get('status') || undefined;
    const slug = url.searchParams.get('slug') || undefined;
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const eventType = url.searchParams.get('eventType') || undefined;
    const tags = url.searchParams.getAll('tags').filter(Boolean);
    const search = url.searchParams.get('search') || undefined;
    const dateFromStr = url.searchParams.get('dateFrom');
    const dateToStr = url.searchParams.get('dateTo');
    const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined;
    const dateTo = dateToStr ? new Date(dateToStr) : undefined;
    const sort = (url.searchParams.get('sort') as 'soonest' | 'newest' | 'popular') || undefined;
    const seriesId = url.searchParams.get('seriesId') || undefined;
    const isFeaturedParam = url.searchParams.get('isFeatured');
    const isFeatured = isFeaturedParam === 'true' ? true : isFeaturedParam === 'false' ? false : undefined;

    if (slug) {
      const event = await EventService.getEventBySlug(slug);
      if (!event) {
        return new Response(JSON.stringify({ success: false, message: 'Event not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ success: true, event: { ...event, _id: event._id?.toString() } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { events, total } = await EventService.getEvents({
      status,
      page,
      limit,
      eventType,
      tags: tags.length ? tags : undefined,
      search,
      dateFrom,
      dateTo,
      sort,
      seriesId,
      isFeatured,
    });

    return new Response(
      JSON.stringify({
        success: true,
        total,
        page,
        limit,
        events: events.map((e: any) => ({
          ...e,
          _id: e._id?.toString(),
          seriesId: e.seriesId?.toString(),
          parentEventId: e.parentEventId?.toString(),
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching events:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to fetch events',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { title, hostEmail, hostName, eventType, startTime, endTime, registrationDeadline, capacity, description, meetingUrl, meetingUrlActive, bannerUrl, tags, venue, location, status, recurrence, isFeatured } = body;

    if (!title || !hostEmail || !eventType || !startTime || !endTime || !capacity) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing required fields: title, hostEmail, eventType, startTime, endTime, capacity' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const parsedData = {
      title,
      hostEmail,
      hostName,
      eventType,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : undefined,
      capacity: parseInt(capacity),
      description,
      meetingUrl,
      meetingUrlActive: meetingUrlActive === true || String(meetingUrlActive) === 'true',
      bannerUrl,
      tags,
      venue,
      location,
      status: status || 'upcoming',
      isFeatured: isFeatured === true || String(isFeatured) === 'true',
    };

    if (recurrence?.frequency) {
      const result = await EventService.createRecurringEvent({ ...parsedData, recurrence: {
        frequency: recurrence.frequency,
        interval: recurrence.interval || 1,
        until: recurrence.until ? new Date(recurrence.until) : undefined,
        occurrences: recurrence.occurrences,
      }});
      return new Response(
        JSON.stringify({
          success: true,
          event: { ...result.parentEvent, _id: result.parentEvent._id?.toString(), seriesId: result.parentEvent.seriesId?.toString() },
          childEvents: result.childEvents.map((e) => ({ ...e, _id: e._id?.toString(), seriesId: e.seriesId?.toString(), parentEventId: e.parentEventId?.toString() })),
          recurring: true,
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const event = await EventService.createEvent(parsedData);

    return new Response(
      JSON.stringify({ success: true, event: { ...event, _id: event._id?.toString() } }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating event:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to create event',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
