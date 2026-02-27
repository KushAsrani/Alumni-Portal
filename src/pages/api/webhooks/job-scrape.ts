export const prerender = false;

import type { APIRoute } from 'astro';

// Webhook endpoint for n8n
export const POST: APIRoute = async ({ request }) => {
  try {
    // Verify webhook signature (optional but recommended)
    const webhookSecret = process.env.WEBHOOK_SECRET;
    const signature = request.headers.get('x-webhook-signature');

    if (webhookSecret && signature !== webhookSecret) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid webhook signature'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const payload = await request.json();
    const { action, data } = payload;

    console.log('Webhook received:', { action, dataSize: data?.length || 0 });

    // Route to appropriate handler
    let response;

    switch (action) {
      case 'scrape_complete':
        response = await handleScrapeComplete(data);
        break;
      case 'scrape_started':
        response = await handleScrapeStarted(data);
        break;
      case 'scrape_failed':
        response = await handleScrapeFailed(data);
        break;
      default:
        response = {
          success: false,
          message: `Unknown action: ${action}`
        };
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Webhook processing failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

async function handleScrapeComplete(data: any) {
  console.log('Scraping completed:', data);
  
  // You can add custom logic here:
  // - Send notifications
  // - Update statistics
  // - Trigger other workflows
  
  return {
    success: true,
    message: 'Scrape completion handled',
    timestamp: new Date().toISOString()
  };
}

async function handleScrapeStarted(data: any) {
  console.log('Scraping started:', data);
  return {
    success: true,
    message: 'Scrape start logged',
    timestamp: new Date().toISOString()
  };
}

async function handleScrapeFailed(data: any) {
  console.error('Scraping failed:', data);
  return {
    success: true,
    message: 'Scrape failure logged',
    timestamp: new Date().toISOString()
  };
}

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({
    message: 'Job Scrape Webhook Endpoint',
    methods: ['POST'],
    actions: ['scrape_complete', 'scrape_started', 'scrape_failed']
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};