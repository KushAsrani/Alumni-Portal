export const prerender = false;

import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../lib/auth';
import { connectToDatabase, type AlumniRegistration } from '../../lib/mongodb';
import { calculateCompleteness } from '../../lib/profile-completeness';

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const stringValue = Array.isArray(value) ? value.join(', ') : String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function formatDateTime(value: unknown): string {
  if (!value) return '';
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export const GET: APIRoute = async ({ url, cookies }) => {
  if (!isAuthenticated(cookies)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const status = url.searchParams.get('status') || 'approved';
    const faculty = url.searchParams.get('faculty') || '';
    const year = url.searchParams.get('year') || '';
    const minScoreValue = url.searchParams.get('minScore');
    const minScore = minScoreValue ? Number(minScoreValue) : 0;

    const query: Record<string, unknown> = {};
    if (status && status !== 'all') query.status = status;
    if (faculty) query.faculty = faculty;
    if (year) query.year = Number(year);

    const { db } = await connectToDatabase();
    const collection = db.collection<AlumniRegistration>('alumni_registrations');
    const registrations = await collection.find(query).sort({ created_at: -1 }).toArray();

    const filtered = registrations
      .map((registration) => ({ registration, completeness: calculateCompleteness(registration).score }))
      .filter((item) => item.completeness >= minScore);

    const headers = [
      'ID',
      'Name',
      'Email',
      'Mobile',
      'Faculty',
      'Year',
      'Degree',
      'University',
      'Company',
      'Job Designation',
      'Location',
      'LinkedIn',
      'Profile Complete %',
      'Status',
      'Verified',
      'Profile Last Updated',
      'Last Login',
      'Open To Mentorship',
      'Open To Work',
      'Open To Referral',
      'Graduation Year',
    ];

    const csvRows = [headers.join(',')];

    for (const { registration, completeness } of filtered) {
      csvRows.push(
        [
          escapeCSV(registration._id?.toString()),
          escapeCSV(registration.name),
          escapeCSV(registration.email),
          escapeCSV(registration.mobile),
          escapeCSV(registration.faculty),
          escapeCSV(registration.year),
          escapeCSV(registration.degree),
          escapeCSV(registration.university),
          escapeCSV(registration.company),
          escapeCSV(registration.job_designation),
          escapeCSV(registration.location),
          escapeCSV(registration.linkedin),
          escapeCSV(completeness),
          escapeCSV(registration.status),
          escapeCSV(registration.is_verified ? 'Yes' : 'No'),
          escapeCSV(formatDateTime(registration.updated_at)),
          escapeCSV(formatDateTime(registration.last_login)),
          escapeCSV(registration.open_to_mentorship ? 'Yes' : 'No'),
          escapeCSV(registration.open_to_work ? 'Yes' : 'No'),
          escapeCSV(registration.open_to_referral ? 'Yes' : 'No'),
          escapeCSV(registration.year),
        ].join(',')
      );
    }

    const fileName = `alumni-export-${status}-${new Date().toISOString().split('T')[0]}.csv`;
    const csvContent = csvRows.join('\n');

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('CSV export error:', error);
    return new Response('An error occurred while exporting data', { status: 500 });
  }
};
