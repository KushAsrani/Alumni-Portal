export const prerender = false;

import type { APIRoute } from 'astro';
import { isAlumniAuthenticated, getCurrentAlumni } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';
import { ObjectId } from 'mongodb';

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
];

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAlumniAuthenticated(cookies)) {
    return new Response(
      JSON.stringify({ success: false, message: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const session = getCurrentAlumni(cookies)!;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Build update object with only allowed fields
  const updateData: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      updateData[field] = body[field];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return new Response(
      JSON.stringify({ success: false, message: 'No valid fields to update' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  updateData.updated_at = new Date();

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    let result;
    try {
      result = await collection.updateOne(
        { _id: new ObjectId(session.alumniId) },
        { $set: updateData }
      );
    } catch {
      // alumniId may not be a valid ObjectId in dev/test environments;
      // fall back to looking up by username or email (matches profile.astro pattern).
      result = await collection.updateOne(
        {
          $or: [
            { username: session.username },
            { email: session.username },
          ],
        },
        { $set: updateData }
      );
    }

    if (result.matchedCount === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'Profile not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Profile updated successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Update profile error:', err);
    return new Response(
      JSON.stringify({ success: false, message: 'Failed to update profile' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
