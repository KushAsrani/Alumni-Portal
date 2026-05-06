export const prerender = false;

import type { APIRoute } from 'astro';
import { getCollection } from '../../../../lib/db/mongodb.ts';
import { ObjectId } from 'mongodb';
import { EventService } from '../../../../lib/db/services/eventService';
import type { PollDocument } from '../../../../lib/db/models/Event';

let indexesSetup = false;

async function ensureIndexes() {
  if (!indexesSetup) {
    indexesSetup = true;
    await EventService.setupQAAndPollIndexes().catch(err => console.error('[polls] Index setup failed:', err));
  }
}

function getVoteStorageKey(voterEmail: string) {
  // MongoDB update paths split on literal dots, so encodeURIComponent is not enough:
  // it leaves dots in email domains (for example example.com). Encode dots too.
  return encodeURIComponent(voterEmail).replace(/\./g, '%2E');
}

function collectVoteValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];

  return Object.values(value as Record<string, unknown>).flatMap(collectVoteValues);
}

function computeResults(poll: PollDocument) {
  const voteValues = collectVoteValues(poll.votes);

  return poll.options.map((_: string, i: number) => {
    const count = voteValues.filter(v => v === String(i)).length;
    return { count };
  });
}

function readLegacyDottedVote(votes: Record<string, unknown>, voterEmail: string) {
  // Votes written before dots were encoded were stored as nested objects, e.g.
  // votes["audience1%40example"].com = "0". Read that shape so existing
  // data counts correctly and the voter's previous selection still appears.
  const legacyKeyParts = encodeURIComponent(voterEmail).split('.');
  let current: unknown = votes;

  for (const part of legacyKeyParts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function getVoterOptionIndex(poll: PollDocument, voterEmail?: string | null) {
  if (!voterEmail) return null;

  const votes = poll.votes as Record<string, unknown>;
  const vote = votes[getVoteStorageKey(voterEmail)] ?? readLegacyDottedVote(votes, voterEmail);
  if (vote === undefined) return null;

  const optionIndex = Number(vote);
  return Number.isInteger(optionIndex) ? optionIndex : null;
}

function serializePoll(poll: PollDocument & { _id?: ObjectId }, voterEmail?: string | null) {
  const { votes: _votes, ...rest } = poll as any;
  return {
    ...rest,
    _id: poll._id?.toString(),
    eventId: poll.eventId.toString(),
    results: computeResults(poll),
    selectedOptionIndex: getVoterOptionIndex(poll, voterEmail),
  };
}

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await ensureIndexes();

    const showAll = url.searchParams.get('all') === 'true';
    const voterEmail = url.searchParams.get('voterEmail');
    const pollsCol = await getCollection<PollDocument>('event_polls');

    const query: any = { eventId: new ObjectId(eventId) };
    if (!showAll) query.isActive = true;

    const polls = await pollsCol
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return new Response(
      JSON.stringify({
        success: true,
        polls: polls.map((poll) => serializePoll(poll, voterEmail)),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[polls] Unhandled error:', error);
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
    const { question, options, hostEmail } = body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Poll question is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
      return new Response(
        JSON.stringify({ success: false, message: 'Poll must have between 2 and 6 options' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!hostEmail) {
      return new Response(JSON.stringify({ success: false, message: 'Host email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
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
        JSON.stringify({ success: false, message: 'Unauthorized: only the host can create polls' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const pollsCol = await getCollection<PollDocument>('event_polls');
    const doc: PollDocument = {
      eventId: new ObjectId(eventId),
      question: question.trim(),
      options: options.map((o: string) => String(o).trim()).filter(Boolean),
      votes: {},
      isActive: true,
      createdAt: new Date(),
    };

    const result = await pollsCol.insertOne(doc);

    return new Response(
      JSON.stringify({
        success: true,
        poll: serializePoll({ ...doc, _id: result.insertedId }),
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[polls] Unhandled error:', error);
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
    const { pollId, action, optionIndex, voterEmail, hostEmail } = body;

    if (!pollId || !action) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing pollId or action' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const pollsCol = await getCollection<PollDocument>('event_polls');

    if (action === 'vote') {
      if (!voterEmail || optionIndex === undefined || optionIndex === null) {
        return new Response(
          JSON.stringify({ success: false, message: 'Voter email and optionIndex are required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const poll = await pollsCol.findOne({ _id: new ObjectId(pollId) });
      if (!poll) {
        return new Response(JSON.stringify({ success: false, message: 'Poll not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!poll.isActive) {
        return new Response(JSON.stringify({ success: false, message: 'Poll is not active' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (optionIndex < 0 || optionIndex >= poll.options.length) {
        return new Response(JSON.stringify({ success: false, message: 'Invalid option index' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Overwrite previous vote (allow vote change).
      const safeKey = getVoteStorageKey(voterEmail);
      const legacyKey = encodeURIComponent(voterEmail);
      const voteUpdate: any = { $set: { [`votes.${safeKey}`]: String(optionIndex) } };
      if (legacyKey !== safeKey) {
        voteUpdate.$unset = { [`votes.${legacyKey}`]: '' };
      }

      await pollsCol.updateOne(
        { _id: new ObjectId(pollId) },
        voteUpdate
      );

      const updated = await pollsCol.findOne({ _id: new ObjectId(pollId) });
      return new Response(
        JSON.stringify({
          success: true,
          poll: serializePoll(updated!, voterEmail),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'toggle') {
      if (!hostEmail) {
        return new Response(
          JSON.stringify({ success: false, message: 'Host email is required' }),
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
          JSON.stringify({ success: false, message: 'Unauthorized: only the host can toggle polls' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const poll = await pollsCol.findOne({ _id: new ObjectId(pollId) });
      if (!poll) {
        return new Response(JSON.stringify({ success: false, message: 'Poll not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const newIsActive = !poll.isActive;
      await pollsCol.updateOne(
        { _id: new ObjectId(pollId) },
        { $set: { isActive: newIsActive } }
      );

      return new Response(
        JSON.stringify({ success: true, isActive: newIsActive }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ success: false, message: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[polls] Unhandled error:', error);
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
    const { pollId, hostEmail } = body;

    if (!pollId || !hostEmail) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing pollId or hostEmail' }),
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
        JSON.stringify({ success: false, message: 'Unauthorized: only the host can delete polls' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const pollsCol = await getCollection<PollDocument>('event_polls');
    const result = await pollsCol.deleteOne({ _id: new ObjectId(pollId) });

    if (result.deletedCount === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Poll not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[polls] Unhandled error:', error);
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
