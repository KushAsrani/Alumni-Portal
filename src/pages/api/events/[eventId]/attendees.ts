export const prerender = false;
import type { APIRoute } from 'astro';
import { getCollection } from '../../../../lib/db/mongodb';
import { ObjectId } from 'mongodb';

// GET — returns confirmed attendees who have showInAttendeeList !== false
export const GET: APIRoute = async ({ params }) => {
  const { eventId } = params;
  if (!eventId) return new Response(JSON.stringify({ error: 'Missing eventId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  try {
    const col = await getCollection('event_rsvps');
    const attendees = await col.find({
      eventId: new ObjectId(eventId),
      rsvpStatus: 'confirmed',
      showInAttendeeList: { $ne: false },
    }).project({ userEmail: 1, userName: 1, faculty: 1, graduationYear: 1, _id: 0 }).toArray();
    return new Response(JSON.stringify({ success: true, attendees }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
