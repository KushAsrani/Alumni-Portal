export const prerender = false;

import type { APIContext } from 'astro';
import pg from 'pg';
const { Client } = pg;

export async function GET({ request }: APIContext) {
  try {
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${import.meta.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY}`;
    
    if (!authHeader || authHeader !== expectedAuth) {
      return new Response(
        'Unauthorized',
        { status: 401 }
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
        'Database configuration error',
        { status: 500 }
      );
    }

    const client = new Client({
      connectionString: connectionString,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    const registrations = await client.query(
      `SELECT 
        id, name, email, mobile, dob, gender, address,
        year, faculty, degree, university, college_name, gpa,
        job_designation, company, location,
        linkedin, github, twitter,
        skills, projects, work_experience, interests,
        photo_blob_url, degree_certificate_url, short_bio, 
        status, created_at, updated_at
       FROM alumni_registrations
       ORDER BY created_at DESC`
    );

    await client.end();

    // Generate CSV
    const headers = [
      'ID', 'Name', 'Email', 'Mobile', 'Date of Birth', 'Gender', 'Address',
      'Graduation Year', 'Faculty', 'Degree', 'University', 'College', 'GPA',
      'Job Designation', 'Company', 'Location',
      'LinkedIn', 'GitHub', 'Twitter',
      'Skills', 'Projects', 'Work Experience', 'Interests',
      'Photo URL', 'Certificate URL', 'Short Bio',
      'Status', 'Created At', 'Updated At'
    ];

    const csvRows = [headers.join(',')];

    registrations.rows.forEach(row => {
      const values = [
        row.id,
        escapeCSV(row.name),
        escapeCSV(row.email),
        escapeCSV(row.mobile),
        row.dob ? new Date(row.dob).toLocaleDateString() : '',
        escapeCSV(row.gender),
        escapeCSV(row.address),
        row.year || '',
        escapeCSV(row.faculty),
        escapeCSV(row.degree),
        escapeCSV(row.university),
        escapeCSV(row.college_name),
        escapeCSV(row.gpa),
        escapeCSV(row.job_designation),
        escapeCSV(row.company),
        escapeCSV(row.location),
        escapeCSV(row.linkedin),
        escapeCSV(row.github),
        escapeCSV(row.twitter),
        escapeCSV(row.skills),
        escapeCSV(row.projects),
        escapeCSV(row.work_experience),
        escapeCSV(row.interests),
        escapeCSV(row.photo_blob_url),
        escapeCSV(row.degree_certificate_url),
        escapeCSV(row.short_bio),
        row.status,
        new Date(row.created_at).toLocaleString(),
        new Date(row.updated_at).toLocaleString()
      ];
      csvRows.push(values.join(','));
    });

    const csvContent = csvRows.join('\n');
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `alumni-registrations-${timestamp}.csv`;

    return new Response(
      csvContent,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${fileName}"`
        }
      }
    );

  } catch (error) {
    console.error('CSV export error:', error);
    
    return new Response(
      'An error occurred while exporting data',
      { status: 500 }
    );
  }
}

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}