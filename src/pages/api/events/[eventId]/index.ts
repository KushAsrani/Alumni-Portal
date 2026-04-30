export const prerender = false;

import type { APIRoute } from 'astro';
import { getCollection } from '../../../../lib/db/mongodb.ts';
import { ObjectId } from 'mongodb';

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = await request.json();
    const allowedFields = ['title', 'hostEmail', 'hostName', 'eventType', 'startTime', 'endTime', 'capacity', 'bannerUrl', 'status', 'meetingUrl', 'meetingUrlActive', 'venue', 'location', 'description', 'tags'];
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }
    const collection = await getCollection('events');
    const result = await collection.updateOne({ _id: new ObjectId(eventId as string) }, { $set: updates });
    if (result.matchedCount === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
