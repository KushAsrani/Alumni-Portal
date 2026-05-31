export const prerender = false;

import type { APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import { isAlumniAuthenticated, getCurrentAlumni } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';

type TestimonialCategory = 'mentorship' | 'community' | 'career' | 'networking' | 'general';
type TestimonialRating = 1 | 2 | 3 | 4 | 5;

interface TestimonialDocument {
  _id?: string;
  alumniId: string;
  alumniName: string;
  alumniEmail: string;
  alumniPhoto?: string;
  alumniYear?: number;
  alumniCompany?: string;
  content: string;
  rating: TestimonialRating;
  category: TestimonialCategory;
  isApproved: boolean;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function serializeTestimonials(items: TestimonialDocument[]) {
  return items.map((item) => ({
    ...item,
    _id: item._id?.toString(),
  }));
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const category = url.searchParams.get('category');
    const limitValue = url.searchParams.get('limit');
    const limit = limitValue ? Number(limitValue) : undefined;
    const query: Record<string, unknown> = { isApproved: true, isPublic: true };

    if (category) {
      query.category = category;
    }

    const { db } = await connectToDatabase();
    const collection = db.collection<TestimonialDocument>('testimonials');
    let cursor = collection.find(query).sort({ createdAt: -1 });

    if (Number.isFinite(limit) && (limit as number) > 0) {
      cursor = cursor.limit(limit as number);
    }

    const testimonials = await cursor.toArray();

    return new Response(JSON.stringify({ testimonials: serializeTestimonials(testimonials) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Testimonials fetch error:', error);
    return new Response(JSON.stringify({ testimonials: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAlumniAuthenticated(cookies)) {
    return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const session = getCurrentAlumni(cookies);
    const body = await request.json();
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    const rating = Number(body?.rating);
    const category = body?.category as TestimonialCategory;
    const isPublic = Boolean(body?.isPublic);
    const validCategories: TestimonialCategory[] = ['mentorship', 'community', 'career', 'networking', 'general'];

    if (!session) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (content.length < 10 || content.length > 500) {
      return new Response(JSON.stringify({ success: false, message: 'Content must be between 10 and 500 characters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (![1, 2, 3, 4, 5].includes(rating)) {
      return new Response(JSON.stringify({ success: false, message: 'Rating must be between 1 and 5' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!validCategories.includes(category)) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid testimonial category' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { db } = await connectToDatabase();
    const alumniCollection = db.collection('alumni_registrations');
    const testimonialsCollection = db.collection<TestimonialDocument>('testimonials');

    let alumni = null;
    try {
      alumni = await alumniCollection.findOne({ _id: new ObjectId(session.alumniId) });
    } catch (error) {
      console.error('Testimonials ObjectId fallback:', error);
      alumni = await alumniCollection.findOne({ $or: [{ username: session.username }, { email: session.username }] });
    }

    if (!alumni) {
      return new Response(JSON.stringify({ success: false, message: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const testimonial: TestimonialDocument = {
      alumniId: session.alumniId,
      alumniName: alumni.name,
      alumniEmail: alumni.email,
      alumniPhoto: alumni.photo_blob_url,
      alumniYear: alumni.year,
      alumniCompany: alumni.company,
      content,
      rating: rating as TestimonialRating,
      category,
      isApproved: false,
      isPublic,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await testimonialsCollection.insertOne(testimonial as any);

    return new Response(JSON.stringify({ success: true, testimonial: { ...testimonial, _id: result.insertedId.toString() } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Testimonials create error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Failed to submit testimonial' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
