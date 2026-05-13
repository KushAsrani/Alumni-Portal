export const prerender = false;

import type { APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import { EventService } from '../../../../lib/db/services/eventService';
import type { DiscussionPostDocument } from '../../../../lib/db/models/Event';

let indexesSetup = false;

async function ensureIndexes() {
  if (!indexesSetup) {
    indexesSetup = true;
    await EventService.setupIndexes().catch(err => console.error('[discussion] Index setup failed:', err));
  }
}

export const GET: APIRoute = async ({ params }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await ensureIndexes();

    const posts = await EventService.getDiscussionPosts(eventId);

    return new Response(
      JSON.stringify({
        success: true,
        posts: posts.map((p: DiscussionPostDocument) => ({
          ...p,
          _id: p._id?.toString(),
          eventId: p.eventId.toString(),
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[discussion] GET error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { authorEmail, authorName, content, isAnonymous } = body;

    if (!authorEmail || typeof authorEmail !== 'string' || authorEmail.trim().length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Author email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Message content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (content.trim().length > 1000) {
      return new Response(
        JSON.stringify({ success: false, message: 'Message must be 1000 characters or less' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify the event exists
    const event = await EventService.getEventById(eventId);
    if (!event) {
      return new Response(JSON.stringify({ success: false, message: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify the user has an RSVP (confirmed or waitlisted)
    const rsvp = await EventService.getRsvpByEmailAndEvent(eventId, authorEmail.trim());
    if (!rsvp || (rsvp.rsvpStatus !== 'confirmed' && rsvp.rsvpStatus !== 'waitlisted')) {
      return new Response(
        JSON.stringify({ success: false, message: 'Only registered attendees can post in the discussion thread' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    await ensureIndexes();

    const post = await EventService.addDiscussionPost(
      eventId,
      authorEmail.trim(),
      authorName || undefined,
      content.trim(),
      !!isAnonymous
    );

    return new Response(
      JSON.stringify({
        success: true,
        post: {
          ...post,
          _id: post._id?.toString(),
          eventId: post.eventId.toString(),
        },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[discussion] POST error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { postId, userEmail } = body;

    if (!postId || !userEmail) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing postId or userEmail' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate postId is a valid ObjectId
    let postObjId: ObjectId;
    try {
      postObjId = new ObjectId(postId);
    } catch {
      return new Response(JSON.stringify({ success: false, message: 'Invalid postId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get the post and verify ownership
    const post = await EventService.getDiscussionPost(postObjId.toString());
    if (!post) {
      return new Response(JSON.stringify({ success: false, message: 'Post not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (post.authorEmail !== userEmail) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized: you can only delete your own posts' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    await EventService.deleteDiscussionPost(postObjId.toString());

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[discussion] DELETE error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
