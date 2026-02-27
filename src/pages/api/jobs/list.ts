export const prerender = false;

import type { APIRoute } from 'astro';
import { JobService } from '../../../lib/db/services/jobService';

export const GET: APIRoute = async ({ url }) => {
  try {
    const status = url.searchParams.get('status') || 'active';
    const source = url.searchParams.get('source') || undefined;
    const location = url.searchParams.get('location') || undefined;
    const experienceLevel = url.searchParams.get('experienceLevel') || undefined;
    const minSalary = url.searchParams.get('minSalary') 
      ? parseInt(url.searchParams.get('minSalary')!) 
      : undefined;
    const featured = url.searchParams.get('featured') === 'true' ? true : undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const skip = parseInt(url.searchParams.get('skip') || '0');
    const sortBy = (url.searchParams.get('sortBy') || 'postedDate') as 'postedDate' | 'scrapedAt' | 'views';
    const sortOrder = (url.searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    const jobs = await JobService.getJobs({
      status,
      source,
      location,
      experienceLevel,
      minSalary,
      featured,
      limit,
      skip,
      sortBy,
      sortOrder,
    });

    return new Response(JSON.stringify({
      success: true,
      total: jobs.length,
      jobs: jobs.map(job => ({
        ...job,
        _id: job._id?.toString(),
      })),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error fetching jobs:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch jobs',
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};