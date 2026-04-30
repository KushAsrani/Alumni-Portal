export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../lib/db/services/eventService';

export const GET: APIRoute = async ({ url }) => {
  try {
    const status = url.searchParams.get('status') || undefined;
    const slug = url.searchParams.get('slug') || undefined;
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

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

    const { events, total } = await EventService.getEvents({ status, page, limit });

    return new Response(
      JSON.stringify({
        success: true,
        total,
        page,
        limit,
        events: events.map((e: any) => ({ ...e, _id: e._id?.toString() })),
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
    const { title, hostEmail, hostName, eventType, startTime, endTime, capacity, description, meetingUrl, meetingUrlActive, bannerUrl, tags, venue, location, status } = body;

    if (!title || !hostEmail || !eventType || !startTime || !endTime || !capacity) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing required fields: title, hostEmail, eventType, startTime, endTime, capacity' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const event = await EventService.createEvent({
      title,
      hostEmail,
      hostName,
      eventType,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      capacity: parseInt(capacity),
      description,
      meetingUrl,
      meetingUrlActive: meetingUrlActive === true || meetingUrlActive === 'true',
      bannerUrl,
      tags,
      venue,
      location,
      status: status || 'upcoming',
    });

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
