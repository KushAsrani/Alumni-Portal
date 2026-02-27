export const prerender = false;

import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';
import fs from 'fs/promises';
import path from 'path';

function checkAuth(request: Request, cookies: any): boolean {
  if (isAuthenticated(cookies)) return true;
  const apiKey = request.headers.get('x-api-key');
  if (apiKey && apiKey === process.env.ADMIN_API_KEY) return true;
  return false;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!checkAuth(request, cookies)) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Unauthorized',
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { action, filters } = await request.json();
    const jobsDir = path.join(process.cwd(), 'src', 'content', 'jobs');

    let files: string[] = [];
    try {
      files = await fs.readdir(jobsDir);
    } catch {
      return new Response(JSON.stringify({
        success: true,
        message: 'No jobs directory found',
        data: { processed: 0, results: [] },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let processed = 0;
    const results: Array<{ file: string; action: string }> = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filepath = path.join(jobsDir, file);
      const content = await fs.readFile(filepath, 'utf-8');
      const job = JSON.parse(content);

      // Apply filters
      if (filters) {
        let matches = true;
        if (filters.source && job.source !== filters.source) matches = false;
        if (filters.location && !job.location?.includes(filters.location)) matches = false;
        if (filters.minAge) {
          const jobDate = new Date(job.posted_date || job.postedDate);
          const jobAge = (Date.now() - jobDate.getTime()) / (24 * 60 * 60 * 1000);
          if (jobAge < filters.minAge) matches = false;
        }
        if (!matches) continue;
      }

      if (action === 'delete') {
        await fs.unlink(filepath);
        results.push({ file, action: 'deleted' });
      } else if (action === 'feature') {
        job.featured = true;
        await fs.writeFile(filepath, JSON.stringify(job, null, 2));
        results.push({ file, action: 'featured' });
      } else if (action === 'unfeature') {
        job.featured = false;
        await fs.writeFile(filepath, JSON.stringify(job, null, 2));
        results.push({ file, action: 'unfeatured' });
      }

      processed++;
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${processed} jobs`,
      data: { processed, results },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in bulk update:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to process bulk update',
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};