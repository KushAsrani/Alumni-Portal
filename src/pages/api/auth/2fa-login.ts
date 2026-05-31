export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import { verifyTwoFATempToken, setAlumniAuthCookie } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';
import { verifyTOTP } from '../../../lib/totp';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const tempToken = typeof body?.tempToken === 'string' ? body.tempToken.trim() : '';
    const totpCode = typeof body?.totpCode === 'string' ? body.totpCode.trim() : '';

    if (!tempToken || !totpCode) {
      return new Response(JSON.stringify({ success: false }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const verification = verifyTwoFATempToken(tempToken);
    if (!verification.valid || !verification.alumniId) {
      return new Response(JSON.stringify({ success: false }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    let alumni = null;
    try {
      alumni = await collection.findOne({ _id: new ObjectId(verification.alumniId) });
    } catch (error) {
      console.error('2FA login ObjectId fallback:', error);
      alumni = await collection.findOne({ $or: [{ username: verification.alumniId }, { email: verification.alumniId }] });
    }

    if (!alumni?.two_fa_secret) {
      return new Response(JSON.stringify({ success: false }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let isValid = verifyTOTP(alumni.two_fa_secret, totpCode);

    if (!isValid) {
      const hashedCode = createHash('sha256').update(totpCode).digest('hex');
      const backupCodes = Array.isArray(alumni.two_fa_backup_codes) ? alumni.two_fa_backup_codes : [];
      const matchedIndex = backupCodes.indexOf(hashedCode);

      if (matchedIndex !== -1) {
        isValid = true;
        const remainingBackupCodes = backupCodes.filter((_: string, index: number) => index !== matchedIndex);
        await collection.updateOne({ _id: alumni._id }, { $set: { two_fa_backup_codes: remainingBackupCodes, updated_at: new Date() } });
      }
    }

    if (!isValid) {
      return new Response(JSON.stringify({ success: false }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    setAlumniAuthCookie(cookies, alumni._id.toString(), alumni.username || alumni.email, alumni.name, alumni.photo_blob_url);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('2FA login error:', error);
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
