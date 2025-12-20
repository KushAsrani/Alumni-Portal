export const prerender = false;

import type { APIContext } from 'astro';
import { put } from '@vercel/blob';

export async function POST({ request }: APIContext) {
  try {
    const formData = await request.formData();
    const file = formData.get('document') as File;

    if (!file) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No file provided'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate file type (PDF, DOC, DOCX, JPG, PNG)
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/jpg',
      'image/png'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid file type. Only PDF, DOC, DOCX, JPG, and PNG files are allowed.'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'File size too large. Maximum size is 10MB.'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const extension = file.name.split('.').pop();
    const filename = `alumni-certificates/${timestamp}-${randomString}.${extension}`;

    // Upload to Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
      token: import.meta.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN,
    });

    return new Response(
      JSON.stringify({
        success: true,
        url: blob.url,
        message: 'Document uploaded successfully'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Upload error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to upload document',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}