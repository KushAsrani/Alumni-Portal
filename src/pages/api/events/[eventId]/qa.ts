export const prerender = false;

import type { APIRoute } from 'astro';
import { getCollection } from '../../../../lib/db/mongodb.ts';
import { ObjectId } from 'mongodb';
import { EventService } from '../../../../lib/db/services/eventService';
import type { QAQuestionDocument } from '../../../../lib/db/models/Event';

let indexesSetup = false;

async function ensureIndexes() {
  if (!indexesSetup) {
    indexesSetup = true;
    await EventService.setupQAAndPollIndexes().catch(err => console.error('[qa] Index setup failed:', err));
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

    const qaCol = await getCollection<QAQuestionDocument>('event_qa');
    const questions = await qaCol
      .find({ eventId: new ObjectId(eventId) })
      .sort({ upvotes: -1, createdAt: 1 })
      .toArray();

    return new Response(
      JSON.stringify({
        success: true,
        questions: questions.map(q => ({
          ...q,
          _id: q._id?.toString(),
          eventId: q.eventId.toString(),
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[qa] Unhandled error:', error);
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
    const { text, authorEmail, authorName, isAnonymous } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Question text is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (text.trim().length > 500) {
      return new Response(
        JSON.stringify({ success: false, message: 'Question text must be 500 characters or less' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!authorEmail) {
      return new Response(JSON.stringify({ success: false, message: 'Author email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const qaCol = await getCollection<QAQuestionDocument>('event_qa');
    const doc: QAQuestionDocument = {
      eventId: new ObjectId(eventId),
      authorEmail,
      authorName: authorName || undefined,
      text: text.trim(),
      upvotes: 0,
      upvotedBy: [],
      answered: false,
      isAnonymous: !!isAnonymous,
      createdAt: new Date(),
    };

    const result = await qaCol.insertOne(doc);

    return new Response(
      JSON.stringify({
        success: true,
        question: {
          ...doc,
          _id: result.insertedId.toString(),
          eventId: doc.eventId.toString(),
        },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[qa] Unhandled error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { questionId, action, authorEmail, answer, hostEmail } = body;

    if (!questionId || !action) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing questionId or action' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const qaCol = await getCollection<QAQuestionDocument>('event_qa');

    if (action === 'upvote') {
      if (!authorEmail) {
        return new Response(
          JSON.stringify({ success: false, message: 'Author email is required for upvote' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const question = await qaCol.findOne({ _id: new ObjectId(questionId) });
      if (!question) {
        return new Response(JSON.stringify({ success: false, message: 'Question not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const alreadyUpvoted = question.upvotedBy.includes(authorEmail);

      if (alreadyUpvoted) {
        await qaCol.updateOne(
          { _id: new ObjectId(questionId) },
          { $inc: { upvotes: -1 }, $pull: { upvotedBy: authorEmail } }
        );
        return new Response(
          JSON.stringify({ success: true, upvotes: question.upvotes - 1, upvoted: false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        await qaCol.updateOne(
          { _id: new ObjectId(questionId) },
          { $inc: { upvotes: 1 }, $push: { upvotedBy: authorEmail } }
        );
        return new Response(
          JSON.stringify({ success: true, upvotes: question.upvotes + 1, upvoted: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    if (action === 'answer') {
      if (!hostEmail || !answer) {
        return new Response(
          JSON.stringify({ success: false, message: 'Host email and answer are required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const event = await EventService.getEventById(eventId);
      if (!event) {
        return new Response(JSON.stringify({ success: false, message: 'Event not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (hostEmail !== event.hostEmail) {
        return new Response(
          JSON.stringify({ success: false, message: 'Unauthorized: only the host can answer questions' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      await qaCol.updateOne(
        { _id: new ObjectId(questionId) },
        { $set: { answered: true, answer, answeredAt: new Date() } }
      );

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, message: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[qa] Unhandled error:', error);
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
    const { questionId, hostEmail } = body;

    if (!questionId || !hostEmail) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing questionId or hostEmail' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const event = await EventService.getEventById(eventId);
    if (!event) {
      return new Response(JSON.stringify({ success: false, message: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (hostEmail !== event.hostEmail) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized: only the host can delete questions' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const qaCol = await getCollection<QAQuestionDocument>('event_qa');
    const result = await qaCol.deleteOne({ _id: new ObjectId(questionId) });

    if (result.deletedCount === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Question not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[qa] Unhandled error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
