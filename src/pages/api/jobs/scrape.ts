export const prerender = false;

import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/auth';

const SCRAPER_API_URL = import.meta.env.SCRAPER_API_URL || 'http://localhost:5000';

export const POST: APIRoute = async ({ request, cookies }) => {
  // Check authentication
  if (!isAuthenticated(cookies)) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Unauthorized. Please login first.'
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  
  try {
    const body = await request.json();
    
    // Forward request to Python API
    const response = await fetch(`${SCRAPER_API_URL}/api/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location: body.location || 'India',
        keywords: body.keywords || [
          'actuarial analyst',
          'actuary',
          'actuarial scientist'
        ],
        max_pages: body.max_pages || 3
      })
    });
    
    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    console.error('Error triggering scrape:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to trigger scraping',
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({
    message: 'Use POST to trigger job scraping',
    example: {
      location: 'India',
      keywords: ['actuarial', 'actuary'],
      max_pages: 3
    }
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
};