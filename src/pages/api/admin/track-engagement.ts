export const prerender = false;

import type { APIRoute } from 'astro';
import { connectToDatabase } from '../../../../lib/mongodb';

type EngagementType = 'profile_view' | 'connection_request' | 'mentorship_booking' | 'login' | 'profile_update';

type EngagementPayload = {
  type?: EngagementType;
  alumniId?: string;
  targetAlumniId?: string;
  alumniName?: string;
  targetAlumniName?: string;
  status?: 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled';
  metadata?: Record<string, any>;
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const payload: EngagementPayload = await request.json();

    if (!payload?.type || !payload?.alumniId) {
      return new Response(
        JSON.stringify({ success: false, error: 'type and alumniId are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const validTypes: EngagementType[] = ['profile_view', 'connection_request', 'mentorship_booking', 'login', 'profile_update'];
    if (!validTypes.includes(payload.type)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid engagement type' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_engagement');

    await collection.insertOne({
      type: payload.type,
      alumniId: payload.alumniId,
      targetAlumniId: payload.targetAlumniId,
      alumniName: payload.alumniName,
      targetAlumniName: payload.targetAlumniName,
      status: payload.status,
      metadata: payload.metadata || {},
      createdAt: new Date(),
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error tracking engagement:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
