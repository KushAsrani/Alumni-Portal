export const prerender = false;

import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import { JobService } from '../../../lib/db/services/jobService';
import type { JobDocument } from '../../../lib/db/models/Job';
import fs from 'fs/promises';
import path from 'path';

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

    // Save to MongoDB
    const jobDocuments: Array<Omit<JobDocument, '_id'>> = jobs.map(job => ({
      jobId: job.id || Buffer.from(`${job.title}|${job.company}|${job.location}`).toString('base64').slice(0, 32),
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description || '',
      salary: job.salary,
      jobType: job.jobType || 'full-time',
      experienceLevel: job.experienceLevel || 'mid',
      skills: job.skills || [],
      qualifications: job.qualifications || [],
      certifications: job.certifications,
      url: job.url,
      source: job.source,
      featured: job.featured || false,
      postedDate: job.posted_date ? new Date(job.posted_date) : new Date(),
      scrapedAt: new Date(),
      lastUpdated: new Date(),
      status: 'active' as const,
      views: 0,
      applications: 0,
    }));

    const result = await JobService.bulkUpsertJobs(jobDocuments);
    console.log(`✅ MongoDB: Inserted ${result.inserted}, Updated ${result.updated}`);

    // Also save to file system for Astro content collections
    const jobsDir = path.join(process.cwd(), 'src', 'content', 'jobs');
    await fs.mkdir(jobsDir, { recursive: true });

    let filesSaved = 0;
    for (const job of jobs) {
      try {
        const filename = `${job.title}-${job.company}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .substring(0, 50) + '.json';

        const filepath = path.join(jobsDir, filename);

        const jobData: any = {
          id: job.id || jobDocuments.find(j => j.title === job.title)?.jobId,
          title: job.title,
          company: job.company,
          location: job.location,
          description: job.description || '',
          url: job.url,
          source: job.source,
          jobType: job.jobType || 'full-time',
          experienceLevel: job.experienceLevel || 'mid',
          skills: job.skills || [],
          qualifications: job.qualifications || [],
          posted_date: job.posted_date || new Date().toISOString().split('T')[0],
          featured: job.featured || false,
        };

        if (job.salary) jobData.salary = job.salary;
        if (job.certifications?.length) jobData.certifications = job.certifications;

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