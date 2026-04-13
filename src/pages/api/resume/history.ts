export const prerender = false;

import type { APIContext } from 'astro';
import { connectToDatabase } from '../../../lib/mongodb';
import { getCurrentAlumni } from '../../../lib/alumni-auth';

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
    const requestedEmail = url.searchParams.get('email');

    if (!requestedEmail) {
      return new Response(
        JSON.stringify({ success: false, message: 'email query parameter is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Security: only allow users to view their own history.
    // The session username is the email used at login, so we compare case-insensitively.
    if (requestedEmail.toLowerCase() !== session.username.toLowerCase()) {
      return new Response(
        JSON.stringify({ success: false, message: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { db } = await connectToDatabase();
    const collection = db.collection('resume_analyses');
    const analyses = await collection
      .find({ alumni_email: requestedEmail })
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
