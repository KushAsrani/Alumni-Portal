export const prerender = false;
import type { APIRoute } from 'astro';
import { getCollection } from '../../../lib/db/mongodb';

export const GET: APIRoute = async ({ url }) => {
  const userEmail = url.searchParams.get('userEmail');
  if (!userEmail) return new Response(JSON.stringify({ savedEventIds: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const col = await getCollection('saved_events');
    const docs = await col.find({ userEmail }).project({ eventId: 1, _id: 0 }).toArray();
    const savedEventIds = docs.map((d: any) => d.eventId?.toString()).filter(Boolean);
    return new Response(JSON.stringify({ success: true, savedEventIds }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ savedEventIds: [] }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
