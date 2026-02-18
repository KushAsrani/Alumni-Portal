export const prerender = false;

import type { APIRoute } from 'astro';

const SCRAPER_API_URL = import.meta.env.SCRAPER_API_URL || 'http://localhost:5000';

export const GET: APIRoute = async ({ url }) => {
  try {
    const limit = url.searchParams.get('limit') || '50';
    const source = url.searchParams.get('source') || '';
    const location = url.searchParams.get('location') || '';
    const minSalary = url.searchParams.get('min_salary') || '';
    
    const params = new URLSearchParams({
      limit,
      ...(source && { source }),
      ...(location && { location }),
      ...(minSalary && { min_salary: minSalary })
    });
    
    const response = await fetch(`${SCRAPER_API_URL}/api/jobs?${params}`);
    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to get jobs',
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};