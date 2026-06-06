export const prerender = false;

import type { APIContext, APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import { getCurrentAlumni, isAlumniAuthenticated } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';
import type { AlumniRegistration } from '../../../lib/mongodb';

type PreferredMentorshipMode = 'online' | 'in-person' | 'either';
type DigestFrequency = 'daily' | 'weekly' | 'never';

type AlumniDocument = AlumniRegistration & { _id: ObjectId };

interface AdvancedSettingsResponse {
  profile_visibility: {
    show_in_directory: boolean;
    show_email_publicly: boolean;
    allow_connection_requests: boolean;
  };
  mentorship_preferences: {
    open_to_mentorship: boolean;
    looking_for_mentor: boolean;
    preferred_mode: PreferredMentorshipMode;
  };
  notification_preferences: {
    connection_requests: boolean;
    upcoming_events: boolean;
    mentorship_requests: boolean;
    weekly_digest: boolean;
    digest_frequency: DigestFrequency;
    notify_on_verification: boolean;
  };
  connected_accounts: {
    linkedin_connected: boolean;
    github_connected: boolean;
    linkedin_url: string;
    github_url: string;
  };
  accessibility: {
    preferred_language: string;
  };
}

const MENTORSHIP_MODES: PreferredMentorshipMode[] = ['online', 'in-person', 'either'];
const DIGEST_FREQUENCIES: DigestFrequency[] = ['daily', 'weekly', 'never'];
const LANGUAGE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function getStringValue(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

function normalizeAdvancedSettings(alumni: AlumniDocument): AdvancedSettingsResponse {
  const profileVisibility = alumni.profile_visibility || {};
  const mentorshipPreferences = alumni.mentorship_preferences || {};
  const notificationPreferences = alumni.notification_preferences || {};
  const linkedinUrl = typeof alumni.linkedin === 'string' ? alumni.linkedin.trim() : '';
  const githubUrl = typeof alumni.github === 'string' ? alumni.github.trim() : '';

  return {
    profile_visibility: {
      show_in_directory: profileVisibility.show_in_directory ?? true,
      show_email_publicly: profileVisibility.show_email_publicly ?? false,
      allow_connection_requests: profileVisibility.allow_connection_requests ?? true,
    },
    mentorship_preferences: {
      open_to_mentorship: alumni.open_to_mentorship ?? false,
      looking_for_mentor: mentorshipPreferences.looking_for_mentor ?? false,
      preferred_mode: mentorshipPreferences.preferred_mode ?? 'either',
    },
    notification_preferences: {
      connection_requests: notificationPreferences.connection_requests ?? true,
      upcoming_events: notificationPreferences.upcoming_events ?? true,
      mentorship_requests: notificationPreferences.mentorship_requests ?? true,
      weekly_digest: notificationPreferences.weekly_digest ?? false,
      digest_frequency: notificationPreferences.digest_frequency ?? 'weekly',
      notify_on_verification: notificationPreferences.notify_on_verification ?? true,
    },
    connected_accounts: {
      linkedin_connected: linkedinUrl.length > 0,
      github_connected: githubUrl.length > 0,
      linkedin_url: linkedinUrl,
      github_url: githubUrl,
    },
    accessibility: {
      preferred_language: alumni.accessibility?.preferred_language ?? 'en',
    },
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
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const alumni = await getAuthenticatedAlumni(cookies);
    if (!alumni) {
      return jsonResponse({ error: 'Profile not found' }, 404);
    }

    return jsonResponse(normalizeAdvancedSettings(alumni));
  } catch (error) {
    console.error('Advanced settings GET error:', error);
    return jsonResponse({ error: 'Failed to load advanced settings' }, 500);
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAlumniAuthenticated(cookies)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const payload = asRecord(body);
  if (!payload) {
    return jsonResponse({ error: 'Request body must be an object.' }, 400);
  }

  try {
    const alumni = await getAuthenticatedAlumni(cookies);
    if (!alumni) {
      return jsonResponse({ error: 'Profile not found' }, 404);
    }

    const setUpdates: Record<string, string | boolean | Date> = {};

    const profileVisibility = asRecord(payload.profile_visibility);
    if (payload.profile_visibility !== undefined && !profileVisibility) {
      return jsonResponse({ error: 'profile_visibility must be an object.' }, 400);
    }

    if (profileVisibility) {
      if (profileVisibility.show_in_directory !== undefined) {
        if (!isBoolean(profileVisibility.show_in_directory)) {
          return jsonResponse({ error: 'profile_visibility.show_in_directory must be a boolean.' }, 400);
        }
        setUpdates['profile_visibility.show_in_directory'] = profileVisibility.show_in_directory;
      }

      if (profileVisibility.show_email_publicly !== undefined) {
        if (!isBoolean(profileVisibility.show_email_publicly)) {
          return jsonResponse({ error: 'profile_visibility.show_email_publicly must be a boolean.' }, 400);
        }
        setUpdates['profile_visibility.show_email_publicly'] = profileVisibility.show_email_publicly;
      }

      if (profileVisibility.allow_connection_requests !== undefined) {
        if (!isBoolean(profileVisibility.allow_connection_requests)) {
          return jsonResponse({ error: 'profile_visibility.allow_connection_requests must be a boolean.' }, 400);
        }
        setUpdates['profile_visibility.allow_connection_requests'] = profileVisibility.allow_connection_requests;
      }
    }

    const mentorshipPreferences = asRecord(payload.mentorship_preferences);
    if (payload.mentorship_preferences !== undefined && !mentorshipPreferences) {
      return jsonResponse({ error: 'mentorship_preferences must be an object.' }, 400);
    }

    if (mentorshipPreferences) {
      if (mentorshipPreferences.open_to_mentorship !== undefined) {
        if (!isBoolean(mentorshipPreferences.open_to_mentorship)) {
          return jsonResponse({ error: 'mentorship_preferences.open_to_mentorship must be a boolean.' }, 400);
        }
        setUpdates.open_to_mentorship = mentorshipPreferences.open_to_mentorship;
      }

      if (mentorshipPreferences.looking_for_mentor !== undefined) {
        if (!isBoolean(mentorshipPreferences.looking_for_mentor)) {
          return jsonResponse({ error: 'mentorship_preferences.looking_for_mentor must be a boolean.' }, 400);
        }
        setUpdates['mentorship_preferences.looking_for_mentor'] = mentorshipPreferences.looking_for_mentor;
      }

      if (mentorshipPreferences.preferred_mode !== undefined) {
        if (typeof mentorshipPreferences.preferred_mode !== 'string' || !MENTORSHIP_MODES.includes(mentorshipPreferences.preferred_mode as PreferredMentorshipMode)) {
          return jsonResponse({ error: 'mentorship_preferences.preferred_mode must be one of online, in-person, either.' }, 400);
        }
        setUpdates['mentorship_preferences.preferred_mode'] = mentorshipPreferences.preferred_mode;
      }
    }

    const notificationPreferences = asRecord(payload.notification_preferences);
    if (payload.notification_preferences !== undefined && !notificationPreferences) {
      return jsonResponse({ error: 'notification_preferences must be an object.' }, 400);
    }

    if (notificationPreferences) {
      if (notificationPreferences.connection_requests !== undefined) {
        if (!isBoolean(notificationPreferences.connection_requests)) {
          return jsonResponse({ error: 'notification_preferences.connection_requests must be a boolean.' }, 400);
        }
        setUpdates['notification_preferences.connection_requests'] = notificationPreferences.connection_requests;
      }

      if (notificationPreferences.upcoming_events !== undefined) {
        if (!isBoolean(notificationPreferences.upcoming_events)) {
          return jsonResponse({ error: 'notification_preferences.upcoming_events must be a boolean.' }, 400);
        }
        setUpdates['notification_preferences.upcoming_events'] = notificationPreferences.upcoming_events;
      }

      if (notificationPreferences.mentorship_requests !== undefined) {
        if (!isBoolean(notificationPreferences.mentorship_requests)) {
          return jsonResponse({ error: 'notification_preferences.mentorship_requests must be a boolean.' }, 400);
        }
        setUpdates['notification_preferences.mentorship_requests'] = notificationPreferences.mentorship_requests;
      }

      if (notificationPreferences.weekly_digest !== undefined) {
        if (!isBoolean(notificationPreferences.weekly_digest)) {
          return jsonResponse({ error: 'notification_preferences.weekly_digest must be a boolean.' }, 400);
        }
        setUpdates['notification_preferences.weekly_digest'] = notificationPreferences.weekly_digest;
      }

      if (notificationPreferences.digest_frequency !== undefined) {
        if (typeof notificationPreferences.digest_frequency !== 'string' || !DIGEST_FREQUENCIES.includes(notificationPreferences.digest_frequency as DigestFrequency)) {
          return jsonResponse({ error: 'notification_preferences.digest_frequency must be one of daily, weekly, never.' }, 400);
        }
        setUpdates['notification_preferences.digest_frequency'] = notificationPreferences.digest_frequency;
      }

      if (notificationPreferences.notify_on_verification !== undefined) {
        if (!isBoolean(notificationPreferences.notify_on_verification)) {
          return jsonResponse({ error: 'notification_preferences.notify_on_verification must be a boolean.' }, 400);
        }
        setUpdates['notification_preferences.notify_on_verification'] = notificationPreferences.notify_on_verification;
      }
    }

    const connectedAccounts = asRecord(payload.connected_accounts);
    if (payload.connected_accounts !== undefined && !connectedAccounts) {
      return jsonResponse({ error: 'connected_accounts must be an object.' }, 400);
    }

    if (connectedAccounts) {
      if (connectedAccounts.linkedin_url !== undefined) {
        const linkedinUrl = getStringValue(connectedAccounts.linkedin_url);
        if (linkedinUrl === null) {
          return jsonResponse({ error: 'connected_accounts.linkedin_url must be a string URL.' }, 400);
        }
        if (linkedinUrl && !isValidUrl(linkedinUrl)) {
          return jsonResponse({ error: 'connected_accounts.linkedin_url must be a valid URL.' }, 400);
        }
        setUpdates.linkedin = linkedinUrl;
        setUpdates['connected_accounts.linkedin_url'] = linkedinUrl;
        setUpdates['connected_accounts.linkedin_connected'] = linkedinUrl.length > 0;
      }

      if (connectedAccounts.github_url !== undefined) {
        const githubUrl = getStringValue(connectedAccounts.github_url);
        if (githubUrl === null) {
          return jsonResponse({ error: 'connected_accounts.github_url must be a string URL.' }, 400);
        }
        if (githubUrl && !isValidUrl(githubUrl)) {
          return jsonResponse({ error: 'connected_accounts.github_url must be a valid URL.' }, 400);
        }
        setUpdates.github = githubUrl;
        setUpdates['connected_accounts.github_url'] = githubUrl;
        setUpdates['connected_accounts.github_connected'] = githubUrl.length > 0;
      }
    }

    const accessibility = asRecord(payload.accessibility);
    if (payload.accessibility !== undefined && !accessibility) {
      return jsonResponse({ error: 'accessibility must be an object.' }, 400);
    }

    if (accessibility && accessibility.preferred_language !== undefined) {
      const preferredLanguage = getStringValue(accessibility.preferred_language);
      if (preferredLanguage === null || preferredLanguage.length === 0) {
        return jsonResponse({ error: 'accessibility.preferred_language must be a string.' }, 400);
      }
      if (preferredLanguage.length > 10 || !LANGUAGE_PATTERN.test(preferredLanguage)) {
        return jsonResponse({ error: 'accessibility.preferred_language must match format like en or en-US.' }, 400);
      }
      setUpdates['accessibility.preferred_language'] = preferredLanguage;
    }

    if (Object.keys(setUpdates).length === 0) {
      return jsonResponse({ success: true, message: 'Settings saved successfully.' });
    }

    setUpdates.updated_at = new Date();

    const { db } = await connectToDatabase();
    await db.collection<AlumniDocument>('alumni_registrations').updateOne(
      { _id: alumni._id },
      { $set: setUpdates }
    );

    return jsonResponse({ success: true, message: 'Settings saved successfully.' });
  } catch (error) {
    console.error('Advanced settings POST error:', error);
    return jsonResponse({ error: 'Failed to save advanced settings' }, 500);
  }
};
