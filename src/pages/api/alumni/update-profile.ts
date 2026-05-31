export const prerender = false;

import type { APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import { isAlumniAuthenticated, getCurrentAlumni } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';
import { recordProfileUpdate } from '../../../lib/profile-history';

const ALLOWED_FIELDS = [
  'name',
  'mobile',
  'dob',
  'gender',
  'address',
  'university',
  'college_name',
  'year',
  'faculty',
  'degree',
  'gpa',
  'job_designation',
  'company',
  'location',
  'linkedin',
  'github',
  'twitter',
  'portfolio',
  'skills',
  'projects',
  'work_experience',
  'interests',
  'short_bio',
  'open_to_mentorship',
  'open_to_work',
  'open_to_referral',
] as const;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAlumniAuthenticated(cookies)) {
    return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = getCurrentAlumni(cookies)!;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch (error) {
    console.error('Update profile parse error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const updateData: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      updateData[field] = body[field];
    }
  }

  for (const field of ['open_to_mentorship', 'open_to_work', 'open_to_referral']) {
    if (field in body) {
      updateData[field] = body[field] === true || body[field] === 'true' || body[field] === 1;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return new Response(JSON.stringify({ success: false, message: 'No valid fields to update' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  updateData.updated_at = new Date();

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    let existing = null;
    try {
      existing = await collection.findOne({ _id: new ObjectId(session.alumniId) });
    } catch (error) {
      console.error('Update profile ObjectId fallback:', error);
      existing = await collection.findOne({ $or: [{ username: session.username }, { email: session.username }] });
    }

    if (!existing) {
      return new Response(JSON.stringify({ success: false, message: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await collection.updateOne({ _id: existing._id }, { $set: updateData });
    const updated = await collection.findOne({ _id: existing._id });

    if (updated) {
      await recordProfileUpdate(existing._id.toString(), existing.email, existing, updated, 'alumni');
    }

    try {
      const engagementCol = db.collection('alumni_engagement');
      await engagementCol.insertOne({
        type: 'profile_update',
        alumniId: session.alumniId,
        alumniName: session.name,
        status: 'completed',
        createdAt: new Date(),
      });
    } catch (error) {
      console.error('Profile update engagement error:', error);
    }

    return new Response(JSON.stringify({ success: true, message: 'Profile updated successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Failed to update profile' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
