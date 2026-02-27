export const prerender = false;

import type { APIRoute } from 'astro';
import { JobService } from '../../../lib/db/services/jobService';

export const GET: APIRoute = async () => {
  try {
    const stats = await JobService.getJobStats();

    return new Response(JSON.stringify({
      success: true,
      stats
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      }
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};