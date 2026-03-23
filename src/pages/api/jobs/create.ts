export const prerender = false;

import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { JobService } from '../../../lib/db/services/jobService';
import type { JobDocument } from '../../../lib/db/models/Job';
import fs from 'fs/promises';
import path from 'path';

/**
 * Ensures a value is an array. If it's a JSON-encoded string of an array,
 * parse it back. This guards against double-serialization issues from
 * workflow tools like n8n.
 */
function ensureArray(value: any): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Not valid JSON — fall through to treat the string as a single-element array
    }
    // Non-empty string becomes a single-element array; empty string becomes []
    return value ? [value] : [];
  }
  return [];
}

function createJobFilename(job: { title: string; company: string }): string {
  return `${job.title}-${job.company}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .substring(0, 50) + '.json';
}

function normalizeJobType(value: any): JobDocument['jobType'] {
  return value === 'part-time' || value === 'contract' || value === 'internship'
    ? value
    : 'full-time';
}

function normalizeExperienceLevel(value: any): JobDocument['experienceLevel'] {
  return value === 'entry' || value === 'senior' || value === 'executive'
    ? value
    : 'mid';
}

function isGenericDescription(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    / position at /.test(normalized) ||
    normalized.startsWith('descriptionabout') ||
    normalized.length < 60
  );
}

function pickBetterDescription(incoming: string, existing?: string): string {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const incomingGeneric = isGenericDescription(incoming);
  const existingGeneric = isGenericDescription(existing);

  if (incomingGeneric && !existingGeneric) return existing;
  if (!incomingGeneric && existingGeneric) return incoming;

  return incoming.length >= existing.length ? incoming : existing;
}

function locationSpecificityScore(location?: string): number {
  if (!location) return 0;

  const normalized = location.toLowerCase();
  let score = normalized.length;

  if (normalized.includes('remote')) score += 20;
  if (normalized.includes('hybrid')) score += 15;
  if (normalized.includes(',')) score += 10;
  if (normalized !== 'india') score += 5;

  return score;
}

function pickBetterLocation(incoming: string, existing?: string): string {
  if (!existing) return incoming;
  return locationSpecificityScore(incoming) >= locationSpecificityScore(existing)
    ? incoming
    : existing;
}

function mergeStringArrays(incoming: any, existing?: any): string[] {
  const merged: string[] = [];

  for (const value of [...ensureArray(existing), ...ensureArray(incoming)]) {
    if (value && !merged.includes(value)) {
      merged.push(value);
    }
  }

  return merged;
}

function preferNonDefaultValue<T>(incoming: T, existing: T | undefined, defaultValue: T): T {
  if (existing !== undefined && incoming === defaultValue && existing !== defaultValue) {
    return existing;
  }

  return incoming ?? existing ?? defaultValue;
}

function checkAuth(request: Request, cookies: any): boolean {
  // Check cookie authentication
  if (isAuthenticated(cookies)) return true;

  // Check API key authentication
  const apiKey = request.headers.get('x-api-key');
  if (apiKey && apiKey === process.env.ADMIN_API_KEY) return true;

  return false;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!checkAuth(request, cookies)) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Unauthorized - provide cookie or x-api-key header'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const jobs = await request.json();

    if (!Array.isArray(jobs)) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Request body must be a JSON array of jobs'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`📥 Received ${jobs.length} jobs to save`);

    const jobsDir = path.join(process.cwd(), 'src', 'content', 'jobs');
    await fs.mkdir(jobsDir, { recursive: true });

    const normalizedJobs = await Promise.all(jobs.map(async (job) => {
      const filename = createJobFilename(job);
      const filepath = path.join(jobsDir, filename);

      let existingJob: any = null;
      try {
        existingJob = JSON.parse(await fs.readFile(filepath, 'utf-8'));
      } catch {
        existingJob = null;
      }

      const mergedSkills = mergeStringArrays(job.skills, existingJob?.skills);
      const mergedQualifications = mergeStringArrays(job.qualifications, existingJob?.qualifications);
      const mergedCertifications = mergeStringArrays(job.certifications, existingJob?.certifications);

      return {
        id: job.id || existingJob?.id || Buffer.from(`${job.title}|${job.company}|${job.location}`).toString('base64').slice(0, 32),
        title: job.title,
        company: job.company,
        location: pickBetterLocation(job.location, existingJob?.location),
        description: pickBetterDescription(job.description || '', existingJob?.description) || '',
        salary: job.salary || existingJob?.salary,
        url: job.url || existingJob?.url,
        source: job.source || existingJob?.source,
        jobType: preferNonDefaultValue(
          normalizeJobType(job.jobType),
          existingJob?.jobType,
          'full-time'
        ),
        experienceLevel: preferNonDefaultValue(
          normalizeExperienceLevel(job.experienceLevel),
          existingJob?.experienceLevel,
          'mid'
        ),
        skills: mergedSkills,
        qualifications: mergedQualifications,
        certifications: mergedCertifications,
        posted_date: job.posted_date || existingJob?.posted_date || new Date().toISOString().split('T')[0],
        featured: Boolean(job.featured || existingJob?.featured),
        filename,
      };
    }));

    // Save to MongoDB
    const jobDocuments: Array<Omit<JobDocument, '_id'>> = normalizedJobs.map(job => ({
      jobId: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      salary: job.salary,
      jobType: job.jobType,
      experienceLevel: job.experienceLevel,
      skills: job.skills,
      qualifications: job.qualifications,
      certifications: job.certifications,
      url: job.url,
      source: job.source,
      featured: job.featured,
      postedDate: job.posted_date ? new Date(job.posted_date) : new Date(),
      scrapedAt: new Date(),
      lastUpdated: new Date(),
      status: 'active' as const,
      views: 0,
      applications: 0,
    }));

    const result = await JobService.bulkUpsertJobs(jobDocuments);
    console.log(`✅ MongoDB: Inserted ${result.inserted}, Updated ${result.updated}`);

    let filesSaved = 0;
    for (const job of normalizedJobs) {
      try {
        const filepath = path.join(jobsDir, job.filename);

        const jobData: any = {
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          description: job.description,
          url: job.url,
          source: job.source,
          jobType: job.jobType,
          experienceLevel: job.experienceLevel,
          skills: job.skills,
          qualifications: job.qualifications,
          posted_date: job.posted_date,
          featured: job.featured,
        };

        if (job.salary) jobData.salary = job.salary;
        const certs = job.certifications;
        if (certs.length > 0) jobData.certifications = certs;

        await fs.writeFile(filepath, JSON.stringify(jobData, null, 2), 'utf-8');
        filesSaved++;
      } catch (err) {
        console.error(`Error saving file for ${job.title}:`, err);
      }
    }

    console.log(`📁 Files saved: ${filesSaved}`);

    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${jobs.length} jobs`,
      data: {
        inserted: result.inserted,
        updated: result.updated,
        filesSaved,
        errors: result.errors,
        total: jobs.length,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating jobs:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to create jobs',
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
