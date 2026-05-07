export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../../lib/db/services/eventService';

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export const GET: APIRoute = async ({ request, params }) => {
  try {
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${import.meta.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY}`;
    if (!authHeader || authHeader !== expectedAuth) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { eventId } = params;
    if (!eventId) {
      return new Response('Missing eventId', { status: 400 });
    }

    const [event, rsvps] = await Promise.all([
      EventService.getEventById(eventId),
      EventService.getRsvps(eventId),
    ]);

    if (!event) {
      return new Response('Event not found', { status: 404 });
    }

    const headers = [
      'Name',
      'Email',
      'Status',
      'Checked In',
      'Checked In At',
      'Faculty',
      'Graduation Year',
      'Guest Count',
      'Activities',
      'RSVP Time',
    ];

    const rows = rsvps.map((rsvp) => [
      escapeCSV(rsvp.userName || ''),
      escapeCSV(rsvp.userEmail || ''),
      escapeCSV(rsvp.rsvpStatus || ''),
      rsvp.checkedIn ? 'Yes' : 'No',
      escapeCSV(rsvp.checkedInAt ? new Date(rsvp.checkedInAt).toISOString() : ''),
      escapeCSV(rsvp.faculty || ''),
      escapeCSV(rsvp.graduationYear ?? ''),
      escapeCSV(rsvp.guestCount ?? 0),
      escapeCSV(Array.isArray(rsvp.activities) ? rsvp.activities.join(' | ') : ''),
      escapeCSV(rsvp.createdAt ? new Date(rsvp.createdAt).toISOString() : ''),
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const datePart = new Date().toISOString().split('T')[0];
    const filename = `event-attendees-${eventId}-${datePart}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting event RSVPs:', error);
    return new Response('An error occurred while exporting attendees', { status: 500 });
  }
};
