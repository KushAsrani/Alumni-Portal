export const prerender = false;

import type { APIRoute } from 'astro';
import { ReminderService } from '../../../lib/db/services/reminderService';
import { sendEmail, buildReminderEmail } from '../../../lib/email';

export const GET: APIRoute = async ({ url }) => {
  // Simple secret-based auth to prevent public triggering
  const secret = url.searchParams.get('secret');
  const expectedSecret = process.env.CRON_SECRET || import.meta.env.CRON_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const origin = url.origin;
  let sent24hReminders = 0, sent1hReminders = 0, errors = 0;

  for (const hoursThreshold of [24, 1]) {
    try {
      const due = await ReminderService.getRsvpsDueForReminder(hoursThreshold);
      for (const { rsvp, event } of due) {
        try {
          const eventUrl = `${origin}/events/${event.slug}`;
          const { subject, html, text } = buildReminderEmail({
            userName: rsvp.userName || rsvp.userEmail,
            eventTitle: event.title,
            eventType: event.eventType,
            startTime: new Date(event.startTime),
            endTime: new Date(event.endTime),
            venue: event.venue,
            location: event.location,
            eventUrl,
            hoursUntil: hoursThreshold,
          });

          await sendEmail({ to: rsvp.userEmail, subject, html, text });
          await ReminderService.markReminderSent(rsvp._id!, hoursThreshold);

          if (hoursThreshold === 24) sent24hReminders++;
          else sent1hReminders++;
        } catch (err) {
          console.error(`Failed to send ${hoursThreshold}h reminder to ${rsvp.userEmail}:`, err);
          errors++;
        }
      }
    } catch (err) {
      console.error(`Error processing ${hoursThreshold}h reminders:`, err);
      errors++;
    }
  }

  return new Response(
    JSON.stringify({ success: true, sent24hReminders, sent1hReminders, errors }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
