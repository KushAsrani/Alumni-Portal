export const prerender = false;
import type { APIRoute } from 'astro';
import { put } from '@vercel/blob';

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return new Response(JSON.stringify({ error: 'File must be an image' }), { status: 400 });
    }

    // Upload to Vercel Blob
    const blob = await put(`event-banners/${Date.now()}-${file.name}`, file, {
      access: 'public',
      token: import.meta.env.BLOB_READ_WRITE_TOKEN,
    });

    return new Response(JSON.stringify({ url: blob.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Upload failed' }), { status: 500 });
  }
};