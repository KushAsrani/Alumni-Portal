export const prerender = false;

import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { connectToDatabase, type AlumniRegistration } from '../../../lib/mongodb';
import { calculateCompleteness } from '../../../lib/profile-completeness';
import { buildIncompleteProfileNudgeEmail, sendEmail } from '../../../lib/email';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) {
    return new Response(JSON.stringify({ sent: 0, skipped: 0, errors: ['Unauthorized'] }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json().catch((error) => {
      console.error('Nudge parse error:', error);
      return {};
    });
    const threshold = typeof body?.threshold === 'number' ? body.threshold : 70;
    const appUrl = process.env.APP_URL || import.meta.env.APP_URL || 'http://localhost:4321';
    const editProfileUrl = `${appUrl}/alumni/edit-profile`;

    const { db } = await connectToDatabase();
    const collection = db.collection<AlumniRegistration>('alumni_registrations');
    const alumni = await collection.find({ status: 'approved' }).toArray();

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const entry of alumni) {
      const completeness = calculateCompleteness(entry);

      if (completeness.score >= threshold || !entry.email) {
        skipped += 1;
        continue;
      }

      try {
        const email = buildIncompleteProfileNudgeEmail({
          userName: entry.name,
          score: completeness.score,
          missingFields: completeness.missing,
          editProfileUrl,
        });

        await sendEmail({ to: entry.email, ...email });
        sent += 1;
      } catch (error) {
        console.error(`Nudge email error for ${entry.email}:`, error);
        errors.push(entry.email);
      }
    }

    return new Response(JSON.stringify({ sent, skipped, errors }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Nudge incomplete error:', error);
    return new Response(JSON.stringify({ sent: 0, skipped: 0, errors: ['Failed to send nudge emails'] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
