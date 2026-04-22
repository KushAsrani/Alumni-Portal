export const prerender = false;

import type { APIContext } from 'astro';
import { connectToDatabase } from '../../../lib/mongodb';
import { getCurrentAlumni } from '../../../lib/alumni-auth';
import { ObjectId } from 'mongodb';

export async function GET({ request, cookies }: APIContext) {
  try {
    // Auth check — only the logged-in user may view their own history
    const session = getCurrentAlumni(cookies);
    if (!session) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(request.url);
    const requestedEmail = url.searchParams.get('email')?.trim().toLowerCase();

    if (!requestedEmail) {
      return new Response(
        JSON.stringify({ success: false, message: 'email query parameter is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Security: only allow users to view their own history.
    // Users can log in with username OR email. The session.username may therefore
    // not be an email, so we resolve the canonical account email from DB.
    const { db } = await connectToDatabase();
    const alumniCollection = db.collection('alumni_registrations');
    const alumni = await alumniCollection.findOne(
      { _id: new ObjectId(session.alumniId) },
      { projection: { email: 1, username: 1 } }
    );

    const allowedEmails = new Set<string>();
    const profileEmail = typeof alumni?.email === 'string' ? alumni.email.trim().toLowerCase() : '';
    if (profileEmail) allowedEmails.add(profileEmail);

    // Backward compatibility for sessions where username itself is an email.
    const sessionUsername = session.username.trim().toLowerCase();
    if (sessionUsername.includes('@')) allowedEmails.add(sessionUsername);

    if (!allowedEmails.has(requestedEmail)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const collection = db.collection('resume_analyses');
    const analyses = await collection
      .find({
        alumni_email: {
          $regex: `^${requestedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          $options: 'i',
        },
      })
      .sort({ created_at: -1 })
      .limit(10)
      .toArray();

    return new Response(
      JSON.stringify({ success: true, analyses }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Resume history error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to fetch resume history.',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function DELETE({ request, cookies }: APIContext) {
  try {
    const session = getCurrentAlumni(cookies);
    if (!session) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json().catch(() => null) as {
      email?: string;
      ids?: string[];
      id?: string;
      deleteAll?: boolean;
    } | null;

    const requestedEmail = body?.email?.trim().toLowerCase();
    if (!requestedEmail) {
      return new Response(
        JSON.stringify({ success: false, message: 'email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { db } = await connectToDatabase();
    const alumniCollection = db.collection('alumni_registrations');
    const alumni = await alumniCollection.findOne(
      { _id: new ObjectId(session.alumniId) },
      { projection: { email: 1, username: 1 } }
    );

    const allowedEmails = new Set<string>();
    const profileEmail = typeof alumni?.email === 'string' ? alumni.email.trim().toLowerCase() : '';
    if (profileEmail) allowedEmails.add(profileEmail);
    const sessionUsername = session.username.trim().toLowerCase();
    if (sessionUsername.includes('@')) allowedEmails.add(sessionUsername);

    if (!allowedEmails.has(requestedEmail)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const collection = db.collection('resume_analyses');
    const emailFilter = {
      alumni_email: {
        $regex: `^${requestedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        $options: 'i',
      },
    };

    const deleteAll = Boolean(body?.deleteAll);
    const requestedIds = Array.from(new Set([...(body?.ids || []), ...(body?.id ? [body.id] : [])]));
    let deletedCount = 0;

    if (deleteAll) {
      const result = await collection.deleteMany(emailFilter);
      deletedCount = result.deletedCount || 0;
    } else {
      const objectIds: ObjectId[] = [];
      for (const id of requestedIds) {
        if (ObjectId.isValid(id)) objectIds.push(new ObjectId(id));
      }
      if (objectIds.length === 0) {
        return new Response(
          JSON.stringify({ success: false, message: 'Provide at least one valid analysis id or set deleteAll=true.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const result = await collection.deleteMany({
        ...emailFilter,
        _id: { $in: objectIds },
      });
      deletedCount = result.deletedCount || 0;
    }

    return new Response(
      JSON.stringify({ success: true, deletedCount }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Resume history delete error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to delete resume history.',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
