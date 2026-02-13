import type { APIRoute } from 'astro';

const SCRAPER_API_URL = import.meta.env.SCRAPER_API_URL || 'http://localhost:5000';

export const GET: APIRoute = async () => {
  try {
    const response = await fetch(`${SCRAPER_API_URL}/api/status`);
    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to get scraping status',
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};