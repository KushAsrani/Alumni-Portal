export const prerender = false;

import type { APIContext } from 'astro';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
const { Client } = pg;

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
    const { id } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ success: false, message: 'Registration ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const connectionString = 
      import.meta.env.POSTGRES_URL_NON_POOLING || 
      import.meta.env.POSTGRES_PRISMA_URL || 
      import.meta.env.POSTGRES_URL ||
      import.meta.env.DATABASE_URL ||
      process.env.POSTGRES_URL_NON_POOLING || 
      process.env.POSTGRES_PRISMA_URL || 
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL;

    if (!connectionString) {
      return new Response(
        JSON.stringify({ success: false, message: 'Database configuration error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const client = new Client({
      connectionString: connectionString,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    const result = await client.query(
      'SELECT * FROM alumni_registrations WHERE id = $1',
      [id]
    );

    await client.end();

    if (result.rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'Registration not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const registration = result.rows[0];

    // Generate slug from name
    const slug = registration.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Create YAML content
    const yamlContent = `name: "${registration.name}"
slug: "${slug}"
faculty: "${registration.faculty || 'N/A'}"
year: ${registration.year || 'null'}
short_bio: "${registration.short_bio || ''}"
long_bio: "${registration.short_bio || ''}"
photo: "${registration.photo_blob_url || '/images/avatars/default-avatar.svg'}"
email: "${registration.email}"
mobile: "${registration.mobile || ''}"
location: "${registration.address || ''}"
company: "${registration.company || ''}"
position: "${registration.job_designation || ''}"
skills: []
projects: []
work_experience:
  - company: "${registration.company || 'N/A'}"
    position: "${registration.job_designation || 'N/A'}"
    duration: "${registration.year || ''} - Present"
    description: ""
education:
  - degree: "${registration.degree || ''}"
    institution: "${registration.university || ''}"
    year: ${registration.year || 'null'}
    gpa: ""
achievements: []
interests: []
social:
  linkedin: "${registration.linkedin || ''}"
  twitter: ""
  github: ""
  portfolio: ""
`;

    // Save to file
    const alumniDir = path.join(process.cwd(), 'src', 'content', 'alumni');
    
    // Ensure directory exists
    if (!fs.existsSync(alumniDir)) {
      fs.mkdirSync(alumniDir, { recursive: true });
    }

    const fileName = `${slug}.yaml`;
    const filePath = path.join(alumniDir, fileName);

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Profile already exists for this alumni'
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    fs.writeFileSync(filePath, yamlContent, 'utf8');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Alumni profile generated successfully',
        data: {
          fileName: fileName,
          slug: slug,
          path: `/alumni/profiles/${slug}`
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Profile generation error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'An error occurred while generating profile',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}