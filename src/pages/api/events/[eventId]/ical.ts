export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../lib/db/services/eventService';

function formatICalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

// Fold long lines per RFC 5545 (max 75 octets per line)
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  let result = '';
  let remaining = line;
  while (remaining.length > 75) {
    result += remaining.slice(0, 75) + '\r\n ';
    remaining = remaining.slice(75);
  }
  result += remaining;
  return result;
}

export const GET: APIRoute = async ({ params, url }) => {
  const { eventId } = params;

  if (!eventId) {
    return new Response('Event ID is required', { status: 400 });
  }

  let event: any = null;
  try {
    event = await EventService.getEventById(eventId);
  } catch (e) {
    return new Response('Database error', { status: 500 });
  }

  if (!event) {
    return new Response('Event not found', { status: 404 });
  }

  const now = new Date();
  const startTime = new Date(event.startTime);
  const endTime = new Date(event.endTime);

  const uid = `${event._id}@alumni-portal.app`;
  const summary = escapeICalText(event.title || 'Alumni Event');
  const description = escapeICalText(event.description || '');
  const location = escapeICalText(
    event.venue
      ? `${event.venue}${event.location ? ', ' + event.location : ''}`
      : event.eventType === 'webinar'
        ? 'Online / Remote'
        : 'TBD'
  );
  const eventUrl = `${url.origin}/events/${event.slug}`;

  const icalLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Alumni Portal//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    foldLine(`UID:${uid}`),
    foldLine(`DTSTAMP:${formatICalDate(now)}`),
    foldLine(`DTSTART:${formatICalDate(startTime)}`),
    foldLine(`DTEND:${formatICalDate(endTime)}`),
    foldLine(`SUMMARY:${summary}`),
    description ? foldLine(`DESCRIPTION:${description}`) : null,
    location ? foldLine(`LOCATION:${location}`) : null,
    foldLine(`URL:${eventUrl}`),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

  const filename = `${event.slug || 'event'}.ics`;

  return new Response(icalLines, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  });
};
