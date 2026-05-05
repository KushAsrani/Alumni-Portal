export const prerender = false;

import type { APIRoute } from 'astro';
import { getCollection } from '../../../../lib/db/mongodb.ts';
import { ObjectId } from 'mongodb';
import { ReminderService } from '../../../../lib/db/services/reminderService';
import { EventService } from '../../../../lib/db/services/eventService';

export const PATCH: APIRoute = async ({ params, request, url }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = await request.json();
    const allowedFields = ['title', 'hostEmail', 'hostName', 'eventType', 'startTime', 'endTime', 'registrationDeadline', 'capacity', 'bannerUrl', 'status', 'meetingUrl', 'meetingUrlActive', 'venue', 'location', 'description', 'tags'];
    const updates: Record<string, any> = { updatedAt: new Date() };
    const unsetFields: Record<string, ''> = {};
    for (const field of allowedFields) {
      if (field in body) {
        if (body[field] === null && field === 'registrationDeadline') {
          unsetFields[field] = '';
        } else {
          updates[field] = body[field];
        }
      }
    }
    const updateOp: Record<string, any> = { $set: updates };
    if (Object.keys(unsetFields).length > 0) updateOp.$unset = unsetFields;
    const collection = await getCollection('events');
    const result = await collection.updateOne({ _id: new ObjectId(eventId as string) }, updateOp);
    if (result.matchedCount === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // After successfully updating meetingUrlActive to true, notify subscribers
    if (body.meetingUrlActive === true) {
      try {
        const subscribers = await ReminderService.getNotifyMeSubscribers(eventId);
        const event = await EventService.getEventById(eventId);
        if (event && subscribers.length > 0) {
          const { buildNotifyMeEmail, sendEmail } = await import('../../../../lib/email');
          const eventUrl = `${url.origin}/events/${event.slug}`;
          const joinLinkUrl = `${url.origin}/api/events/${eventId}/join`;
          for (const sub of subscribers) {
            try {
              const { subject, html, text } = buildNotifyMeEmail({
                userName: sub.userName || sub.userEmail,
                eventTitle: event.title,
                eventUrl,
                joinLinkUrl,
              });
              await sendEmail({ to: sub.userEmail, subject, html, text });
            } catch (e) {
              console.error('Failed to send notify-me email to', sub.userEmail, e);
            }
          }
        }
      } catch (e) {
        console.error('Failed to send join link notifications:', e);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
