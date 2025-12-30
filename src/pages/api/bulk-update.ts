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
    const { ids, status } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'IDs array is required and must not be empty'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
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

    // Convert string IDs to ObjectIds
    const objectIds = ids.map(id => new ObjectId(id));

    // Update multiple documents
    const result = await collection.updateMany(
      { _id: { $in: objectIds } },
      { 
        $set: { 
          status: status,
          updated_at: new Date()
        }
      }
    );

    // Get updated documents
    const updatedDocs = await collection
      .find({ _id: { $in: objectIds } })
      .toArray();

    const formattedDocs = updatedDocs.map(doc => ({
      id: doc._id?.toString(),
      name: doc.name,
      status: doc.status
    }));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully updated ${result.modifiedCount} registration(s) to ${status}`,
        data: formattedDocs
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Bulk update error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'An error occurred while updating registrations',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}