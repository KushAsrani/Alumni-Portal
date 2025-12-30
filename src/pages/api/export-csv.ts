export const prerender = false;

import type { APIContext } from 'astro';
import { connectToDatabase } from '../../lib/mongodb';

export async function GET({ request }: APIContext) {
  try {
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${import.meta.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY}`;
    
    if (!authHeader || authHeader !== expectedAuth) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Connect to MongoDB
    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    // Get all registrations
    const registrations = await collection
      .find({})
      .sort({ created_at: -1 })
      .toArray();

    // Generate CSV
    const headers = [
      'ID', 'Name', 'Email', 'Mobile', 'Date of Birth', 'Gender', 'Address',
      'Graduation Year', 'Faculty', 'Degree', 'University', 'College', 'GPA',
      'Job Designation', 'Company', 'Location', 'LinkedIn', 'GitHub', 'Twitter', 'Portfolio',
      'Skills', 'Projects', 'Work Experience', 'Interests',
      'Photo URL', 'Certificate URL', 'Short Bio',
      'Status', 'Created At', 'Updated At'
    ];

    const csvRows = [headers.join(',')];

    registrations.forEach(row => {
      const values = [
        row._id?.toString(),
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
        escapeCSV(row.portfolio),
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

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${fileName}"`
      }
    });

  } catch (error) {
    console.error('CSV export error:', error);
    return new Response('An error occurred while exporting data', { status: 500 });
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