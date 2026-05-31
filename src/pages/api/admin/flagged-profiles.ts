export const prerender = false;

import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { connectToDatabase, type AlumniRegistration } from '../../../lib/mongodb';

export const GET: APIRoute = async ({ cookies }) => {
  if (!isAuthenticated(cookies)) {
    return new Response(JSON.stringify({ flagged: [] }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection<AlumniRegistration>('alumni_registrations');
    const flagged = await collection
      .find({ is_flagged: true, flag_resolved: { $ne: true } })
      .sort({ flag_reported_at: -1 })
      .toArray();

    return new Response(
      JSON.stringify({
        flagged: flagged.map((entry) => ({
          ...entry,
          _id: entry._id?.toString(),
        })),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Flagged profiles error:', error);
    return new Response(JSON.stringify({ flagged: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
