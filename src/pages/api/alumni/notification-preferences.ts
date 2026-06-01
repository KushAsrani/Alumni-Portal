export const prerender = false;

import type { APIContext, APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import { getCurrentAlumni, isAlumniAuthenticated } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';
import type { AlumniRegistration } from '../../../lib/mongodb';

interface NotificationPreferences {
  connection_requests: boolean;
  upcoming_events: boolean;
  mentorship_requests: boolean;
  weekly_digest: boolean;
}

type AlumniDocument = AlumniRegistration & { _id: ObjectId };

const DEFAULT_PREFERENCES: NotificationPreferences = {
  connection_requests: true,
  upcoming_events: true,
  mentorship_requests: true,
  weekly_digest: false,
};

function normalizePreferences(value: unknown): NotificationPreferences {
  const prefs = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};

  return {
    connection_requests: prefs.connection_requests === undefined ? DEFAULT_PREFERENCES.connection_requests : Boolean(prefs.connection_requests),
    upcoming_events: prefs.upcoming_events === undefined ? DEFAULT_PREFERENCES.upcoming_events : Boolean(prefs.upcoming_events),
    mentorship_requests: prefs.mentorship_requests === undefined ? DEFAULT_PREFERENCES.mentorship_requests : Boolean(prefs.mentorship_requests),
    weekly_digest: prefs.weekly_digest === undefined ? DEFAULT_PREFERENCES.weekly_digest : Boolean(prefs.weekly_digest),
  };
}

async function getAuthenticatedAlumni(cookies: APIContext['cookies']): Promise<AlumniDocument | null> {
  const session = getCurrentAlumni(cookies);
  if (!session) {
    return null;
  }

  const { db } = await connectToDatabase();
  const collection = db.collection<AlumniDocument>('alumni_registrations');

  if (ObjectId.isValid(session.alumniId)) {
    const byId = await collection.findOne({ _id: new ObjectId(session.alumniId) });
    if (byId) {
      return byId;
    }
  }

  return collection.findOne({
    $or: [{ username: session.username }, { email: session.username }],
  });
}

export const GET: APIRoute = async ({ cookies }) => {
  if (!isAlumniAuthenticated(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const alumni = await getAuthenticatedAlumni(cookies);

    if (!alumni) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const notification_preferences = normalizePreferences(alumni.notification_preferences);
    return new Response(JSON.stringify({ notification_preferences }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Notification preferences GET error:', error);
    return new Response(JSON.stringify({ error: 'Failed to load notification preferences' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAlumniAuthenticated(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const alumni = await getAuthenticatedAlumni(cookies);

    if (!alumni) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const notification_preferences = normalizePreferences(body);
    const { db } = await connectToDatabase();
    await db.collection<AlumniDocument>('alumni_registrations').updateOne(
      { _id: alumni._id },
      {
        $set: {
          notification_preferences,
          updated_at: new Date(),
        },
      }
    );

    return new Response(JSON.stringify({ message: 'Notification preferences saved', notification_preferences }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Notification preferences POST error:', error);
    return new Response(JSON.stringify({ error: 'Failed to save notification preferences' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
