export const prerender = false;

import type { APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import QRCode from 'qrcode';
import { isAlumniAuthenticated, getCurrentAlumni } from '../../../lib/alumni-auth';
import { connectToDatabase } from '../../../lib/mongodb';
import { generateTOTPSecret, secretToBase32, getTOTPUri } from '../../../lib/totp';

export const POST: APIRoute = async ({ cookies }) => {
  if (!isAlumniAuthenticated(cookies)) {
    return new Response(JSON.stringify({ message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const session = getCurrentAlumni(cookies);
    if (!session) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    let alumni = null;
    try {
      alumni = await collection.findOne({ _id: new ObjectId(session.alumniId) });
    } catch (error) {
      console.error('2FA setup ObjectId fallback:', error);
      alumni = await collection.findOne({ $or: [{ username: session.username }, { email: session.username }] });
    }

    if (!alumni) {
      return new Response(JSON.stringify({ message: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const secret = generateTOTPSecret();
    const base32Secret = secretToBase32(secret);
    const issuerName = process.env.TOTP_ISSUER || import.meta.env.TOTP_ISSUER || 'Alumni Portal';
    const otpauthUri = getTOTPUri(secret, alumni.email, issuerName);
    const qrDataUrl = await QRCode.toDataURL(otpauthUri);

    await collection.updateOne({ _id: alumni._id }, { $set: { two_fa_secret: secret, updated_at: new Date() } });

    return new Response(JSON.stringify({ secret: base32Secret, otpauthUri, qrDataUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    return new Response(JSON.stringify({ message: 'Failed to set up two-factor authentication' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
