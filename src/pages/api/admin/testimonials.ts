export const prerender = false;

import type { APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import { isAuthenticated } from '../../../lib/auth';
import { connectToDatabase } from '../../../lib/mongodb';

function serializeTestimonials(items: any[]) {
  return items.map((item) => ({
    ...item,
    _id: item._id?.toString(),
  }));
}

export const GET: APIRoute = async ({ url, cookies }) => {
  if (!isAuthenticated(cookies)) {
    return new Response(JSON.stringify({ success: false, testimonials: [] }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const approved = url.searchParams.get('approved');
    const query = approved === 'false' ? { isApproved: false } : {};
    const { db } = await connectToDatabase();
    const testimonials = await db.collection('testimonials').find(query).sort({ createdAt: -1 }).toArray();

    return new Response(JSON.stringify({ success: true, testimonials: serializeTestimonials(testimonials) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Admin testimonials fetch error:', error);
    return new Response(JSON.stringify({ success: false, testimonials: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PATCH: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) {
    return new Response(JSON.stringify({ success: false }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const testimonialId = typeof body?.testimonialId === 'string' ? body.testimonialId.trim() : '';
    const action = body?.action;

    if (!testimonialId || !['approve', 'reject', 'delete'].includes(action)) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { db } = await connectToDatabase();
    const collection = db.collection('testimonials');

    const query = { _id: new ObjectId(testimonialId) };

    if (action === 'delete') {
      await collection.deleteOne(query);
    } else if (action === 'approve') {
      await collection.updateOne(query, { $set: { isApproved: true, updatedAt: new Date() } });
    } else {
      await collection.updateOne(query, { $set: { isApproved: false, isPublic: false, updatedAt: new Date() } });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Admin testimonials patch error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Failed to update testimonial' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
