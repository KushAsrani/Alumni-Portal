export const prerender = false;
import type { APIRoute } from 'astro';
import { getCollection } from '../../../../lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { isAlumniAuthenticated } from '../../../../lib/alumni-auth';

// GET — check if current user has saved this event
export const GET: APIRoute = async ({ params, cookies, url }) => {
  if (!isAlumniAuthenticated(cookies)) return new Response(JSON.stringify({ saved: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const { eventId } = params;
  const userEmail = url.searchParams.get('userEmail');
  if (!eventId || !userEmail) return new Response(JSON.stringify({ saved: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const col = await getCollection('saved_events');
    const doc = await col.findOne({ eventId: new ObjectId(eventId), userEmail });
    return new Response(JSON.stringify({ saved: !!doc }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ saved: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
};

// POST — save an event
export const POST: APIRoute = async ({ params, request, cookies }) => {
  if (!isAlumniAuthenticated(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const { eventId } = params;
  if (!eventId) return new Response(JSON.stringify({ error: 'Missing eventId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const body = await request.json();
  const { userEmail } = body;
  if (!userEmail) return new Response(JSON.stringify({ error: 'Missing userEmail' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  try {
    const col = await getCollection('saved_events');
    await col.updateOne(
      { eventId: new ObjectId(eventId), userEmail },
      { $setOnInsert: { eventId: new ObjectId(eventId), userEmail, createdAt: new Date() } },
      { upsert: true }
    );
    return new Response(JSON.stringify({ success: true, saved: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

// DELETE — unsave an event
export const DELETE: APIRoute = async ({ params, request, cookies }) => {
  if (!isAlumniAuthenticated(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const { eventId } = params;
  if (!eventId) return new Response(JSON.stringify({ error: 'Missing eventId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const body = await request.json();
  const { userEmail } = body;
  if (!userEmail) return new Response(JSON.stringify({ error: 'Missing userEmail' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  try {
    const col = await getCollection('saved_events');
    await col.deleteOne({ eventId: new ObjectId(eventId), userEmail });
    return new Response(JSON.stringify({ success: true, saved: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
