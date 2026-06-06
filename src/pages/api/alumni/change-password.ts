export const prerender = false;

import type { APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import { connectToDatabase, type AlumniRegistration } from '../../../lib/mongodb';
import { getCurrentAlumni, hashAlumniPassword, verifyAlumniPassword } from '../../../lib/alumni-auth';

interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

type AlumniDocument = AlumniRegistration & { _id: ObjectId; name: string; username?: string };

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const session = getCurrentAlumni(cookies);

    if (!session) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body.' }, 400);
    }

    const currentPassword = typeof (payload as ChangePasswordPayload)?.currentPassword === 'string'
      ? (payload as ChangePasswordPayload).currentPassword
      : '';
    const newPassword = typeof (payload as ChangePasswordPayload)?.newPassword === 'string'
      ? (payload as ChangePasswordPayload).newPassword
      : '';
    const confirmNewPassword = typeof (payload as ChangePasswordPayload)?.confirmNewPassword === 'string'
      ? (payload as ChangePasswordPayload).confirmNewPassword
      : '';

    if (!currentPassword.trim()) {
      return jsonResponse({ error: 'Current password is required.' }, 400);
    }

    const { db } = await connectToDatabase();
    const collection = db.collection<AlumniDocument>('alumni_registrations');

    const alumniDoc = ObjectId.isValid(session.alumniId)
      ? await collection.findOne({ _id: new ObjectId(session.alumniId) })
      : await collection.findOne({ _id: session.alumniId as unknown as ObjectId });

    if (!alumniDoc) {
      return jsonResponse({ error: 'Alumni profile not found.' }, 404);
    }

    if (!alumniDoc.password_hash) {
      return jsonResponse({ error: 'No password is set for this account. Please contact admin.' }, 400);
    }

    if (!verifyAlumniPassword(currentPassword, alumniDoc.password_hash)) {
      return jsonResponse({ error: 'Current password is incorrect.' }, 400);
    }

    if (newPassword.length < 8) {
      return jsonResponse({ error: 'New password must be at least 8 characters.' }, 400);
    }

    if (!/[A-Z]/.test(newPassword)) {
      return jsonResponse({ error: 'New password must include at least one uppercase letter.' }, 400);
    }

    if (!/[a-z]/.test(newPassword)) {
      return jsonResponse({ error: 'New password must include at least one lowercase letter.' }, 400);
    }

    if (!/[0-9]/.test(newPassword)) {
      return jsonResponse({ error: 'New password must include at least one number.' }, 400);
    }

    if (newPassword !== confirmNewPassword) {
      return jsonResponse({ error: 'Passwords do not match.' }, 400);
    }

    if (newPassword === currentPassword) {
      return jsonResponse({ error: 'New password must be different from your current password.' }, 400);
    }

    const newHash = hashAlumniPassword(newPassword);
    const now = new Date();

    await collection.updateOne(
      { _id: alumniDoc._id },
      {
        $set: {
          password_hash: newHash,
          updated_at: now,
          password_changed_at: now,
        },
      }
    );

    await db.collection('alumni_engagement').insertOne({
      type: 'password_change',
      alumniId: alumniDoc._id.toString(),
      alumniName: alumniDoc.name,
      status: 'completed',
      createdAt: new Date(),
    });

    return jsonResponse({ success: true, message: 'Password changed successfully.' }, 200);
  } catch (error) {
    console.error('Change password API error:', error);
    return jsonResponse({ error: 'An error occurred. Please try again.' }, 500);
  }
};
