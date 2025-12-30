export const prerender = false;

import type { APIContext } from 'astro';
import { connectToDatabase } from '../../lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST({ request }: APIContext) {
  try {
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${import.meta.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY}`;
    
    if (!authHeader || authHeader !== expectedAuth) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'ID and status are required'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid status. Must be: pending, approved, or rejected'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Connect to MongoDB
    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    // Update the document
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          status: status,
          updated_at: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Registration not found'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Registration ${status} successfully`,
        data: {
          ...result,
          id: result._id?.toString()
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Update status error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'An error occurred while updating status',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}