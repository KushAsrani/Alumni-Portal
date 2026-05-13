import { getCollection } from '../mongodb.ts';
import type {
  DiscussionPostDocument,
  EventDocument,
  EventFeedbackDocument,
  EventReferralDocument,
  EventRSVPDocument,
  EventSeriesDocument,
  NetworkingRoomDocument,
  RoomMessageDocument,
} from '../models/Event';
import { ObjectId } from 'mongodb';
import crypto, { randomBytes } from 'node:crypto';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// NOTE: Existing events in MongoDB may have meetingUrlActive: undefined.
// This is intentional — undefined is treated as falsy (false), so the join
// link remains hidden until an admin explicitly sets meetingUrlActive: true
// via PATCH /api/events/:id. The frontend checks `event.meetingUrlActive === true`
// (strict equality) and the join API checks `event.meetingUrlActive !== true`,
// so both correctly reject undefined. No migration script is needed.

export class EventService {
  private static readonly EVENTS_COLLECTION = 'events';
  private static readonly RSVPS_COLLECTION = 'event_rsvps';
  private static readonly REFERRALS_COLLECTION = 'event_referrals';
  private static readonly ROOMS_COLLECTION = 'networking_rooms';
  private static readonly MESSAGES_COLLECTION = 'room_messages';
  private static readonly DISCUSSION_COLLECTION = 'event_discussions';
  private static readonly FEEDBACK_COLLECTION = 'event_feedback';
  private static readonly SERIES_COLLECTION = 'event_series';
  private static readonly REFERRAL_CODE_BYTE_LENGTH = 4;
  private static readonly MAX_REFERRAL_CODE_GENERATION_ATTEMPTS = 5;
  private static readonly MAX_DISCUSSION_POSTS = 100;
  private static readonly RATING_PRECISION = 1;

  /**
   * Create a new event
   */
  static async createEvent(
    data: Omit<EventDocument, '_id' | 'slug' | 'createdAt' | 'updatedAt'>
  ): Promise<EventDocument> {
    const collection = await getCollection<EventDocument>(this.EVENTS_COLLECTION);

    const slug = `${slugify(data.title)}-${Date.now()}`;
    const now = new Date();
    const doc: EventDocument = {
      ...data,
      slug,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      registrationDeadline: data.registrationDeadline ? new Date(data.registrationDeadline) : undefined,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }

  /**
   * List events with pagination and RSVP counts
   */
  static async getEvents(filters: {
    status?: string;
    page?: number;
    limit?: number;
    slug?: string;
    eventType?: string;
    tags?: string[];
    search?: string;
    dateFrom?: Date;
    dateTo?: Date;
    sort?: 'soonest' | 'newest' | 'popular';
    seriesId?: string;
    isFeatured?: boolean;
  } = {}): Promise<{ events: any[]; total: number }> {
    const collection = await getCollection<EventDocument>(this.EVENTS_COLLECTION);

    const query: any = {};
    if (filters.status) query.status = filters.status;
    if (filters.slug) query.slug = filters.slug;
    if (filters.eventType) query.eventType = filters.eventType;
    if (filters.tags?.length) query.tags = { $in: filters.tags };
    if (filters.search) query.$text = { $search: filters.search };
    if (filters.dateFrom || filters.dateTo) {
      query.startTime = {};
      if (filters.dateFrom) query.startTime.$gte = filters.dateFrom;
      if (filters.dateTo) query.startTime.$lte = filters.dateTo;
    }
    if (filters.seriesId) query.seriesId = new ObjectId(filters.seriesId);
    if (filters.isFeatured !== undefined) query.isFeatured = filters.isFeatured;

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    // Determine sort stage
    let sortStage: any;
    if (filters.sort === 'newest') {
      sortStage = { $sort: { createdAt: -1 } };
    } else {
      // 'soonest' (default) — 'popular' sort applied after $addFields
      sortStage = { $sort: { startTime: 1 } };
    }

    const pipeline: any[] = [
      { $match: query },
      sortStage,
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: this.RSVPS_COLLECTION,
          let: { eventId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$eventId', '$$eventId'] } } },
            {
              $group: {
                _id: '$rsvpStatus',
                count: { $sum: 1 },
              },
            },
          ],
          as: 'rsvpStats',
        },
      },
      {
        $addFields: {
          confirmedCount: {
            $ifNull: [
              {
                $arrayElemAt: [
                  {
                    $map: {
                      input: {
                        $filter: {
                          input: '$rsvpStats',
                          cond: { $eq: ['$$this._id', 'confirmed'] },
                        },
                      },
                      in: '$$this.count',
                    },
                  },
                  0,
                ],
              },
              0,
            ],
          },
          waitlistCount: {
            $ifNull: [
              {
                $arrayElemAt: [
                  {
                    $map: {
                      input: {
                        $filter: {
                          input: '$rsvpStats',
                          cond: { $eq: ['$$this._id', 'waitlisted'] },
                        },
                      },
                      in: '$$this.count',
                    },
                  },
                  0,
                ],
              },
              0,
            ],
          },
        },
      },
      { $project: { rsvpStats: 0 } },
    ];

    // 'popular' sort must come after $addFields so confirmedCount is available
    if (filters.sort === 'popular') {
      pipeline.push({ $sort: { confirmedCount: -1, startTime: 1 } });
    }

    const [events, total] = await Promise.all([
      collection.aggregate(pipeline).toArray(),
      collection.countDocuments(query),
    ]);

    return { events, total };
  }

  /**
   * Get a single event by slug with RSVP counts
   */
  static async getEventBySlug(slug: string): Promise<any | null> {
    const result = await this.getEvents({ slug, limit: 1 });
    return result.events[0] || null;
  }

  /**
   * Get a single event by ID
   */
  static async getEventById(eventId: string): Promise<EventDocument | null> {
    const collection = await getCollection<EventDocument>(this.EVENTS_COLLECTION);
    return collection.findOne({ _id: new ObjectId(eventId) });
  }

  /**
   * RSVP to an event
   */
  static async rsvp(
    eventId: string,
    userEmail: string,
    userName?: string,
    extraFields?: {
      mobile?: string;
      faculty?: string;
      graduationYear?: number;
      hasGuest?: boolean;
      guestCount?: number;
      guests?: Array<{ name?: string; email?: string; mobile?: string; faculty?: string; year?: number }>;
      activities?: string[];
      comments?: string;
      referralCode?: string;
    }
  ): Promise<{ status: 'confirmed' | 'waitlisted'; rsvp: EventRSVPDocument }> {
    const eventsCollection = await getCollection<EventDocument>(this.EVENTS_COLLECTION);
    const rsvpsCollection = await getCollection<EventRSVPDocument>(this.RSVPS_COLLECTION);

    const eventObjId = new ObjectId(eventId);
    const event = await eventsCollection.findOne({ _id: eventObjId });
    if (!event) throw new Error('Event not found');

    const confirmedCount = await rsvpsCollection.countDocuments({
      eventId: eventObjId,
      rsvpStatus: 'confirmed',
    });

    const rsvpStatus: 'confirmed' | 'waitlisted' =
      confirmedCount >= event.capacity ? 'waitlisted' : 'confirmed';
    const qrToken = rsvpStatus === 'confirmed' ? crypto.randomUUID() : undefined;

    const now = new Date();
    const doc: EventRSVPDocument = {
      eventId: eventObjId,
      userEmail,
      userName,
      rsvpStatus,
      qrToken,
      checkedIn: false,
      reminderSent: false,
      mobile: extraFields?.mobile,
      faculty: extraFields?.faculty,
      graduationYear: extraFields?.graduationYear,
      hasGuest: extraFields?.hasGuest,
      guestCount: extraFields?.guestCount,
      guests: extraFields?.guests,
      activities: extraFields?.activities,
      comments: extraFields?.comments,
      createdAt: now,
    };

    const result = await rsvpsCollection.insertOne(doc);
    if (extraFields?.referralCode) {
      await this.incrementReferralRsvp(eventId, extraFields.referralCode, userEmail);
    }
    return { status: rsvpStatus, rsvp: { ...doc, _id: result.insertedId, qrToken } };
  }

  /**
   * Cancel an RSVP and promote next waitlisted user if needed
   */
  static async cancelRsvp(
    eventId: string,
    userEmail: string
  ): Promise<{ promoted: boolean; promotedEmail?: string }> {
    const rsvpsCollection = await getCollection<EventRSVPDocument>(this.RSVPS_COLLECTION);
    const eventObjId = new ObjectId(eventId);

    const existing = await rsvpsCollection.findOne({
      eventId: eventObjId,
      userEmail,
    });

    if (!existing) throw new Error('RSVP not found');

    await rsvpsCollection.deleteOne({ eventId: eventObjId, userEmail });

    // Promote oldest waitlisted user if the cancelled RSVP was confirmed
    if (existing.rsvpStatus === 'confirmed') {
      const next = await rsvpsCollection.findOne(
        { eventId: eventObjId, rsvpStatus: 'waitlisted' },
        { sort: { createdAt: 1 } }
      );

      if (next) {
        await rsvpsCollection.updateOne(
          { _id: next._id },
          { $set: { rsvpStatus: 'confirmed' } }
        );
        return { promoted: true, promotedEmail: next.userEmail };
      }
    }

    return { promoted: false };
  }

  /**
   * Check in a user
   */
  static async checkIn(
    eventId: string,
    userEmail: string
  ): Promise<boolean> {
    const rsvpsCollection = await getCollection<EventRSVPDocument>(this.RSVPS_COLLECTION);
    const eventObjId = new ObjectId(eventId);

    const result = await rsvpsCollection.updateOne(
      { eventId: eventObjId, userEmail, rsvpStatus: 'confirmed' },
      { $set: { checkedIn: true, checkedInAt: new Date() } }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Check in a user by QR token
   */
  static async checkInByToken(
    eventId: string,
    token: string
  ): Promise<boolean> {
    const rsvpsCollection = await getCollection<EventRSVPDocument>(this.RSVPS_COLLECTION);
    const result = await rsvpsCollection.updateOne(
      { eventId: new ObjectId(eventId), qrToken: token, rsvpStatus: 'confirmed' },
      { $set: { checkedIn: true, checkedInAt: new Date() } }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Get RSVPs for an event
   */
  static async getRsvps(
    eventId: string,
    statusFilter?: string
  ): Promise<EventRSVPDocument[]> {
    const rsvpsCollection = await getCollection<EventRSVPDocument>(this.RSVPS_COLLECTION);
    const eventObjId = new ObjectId(eventId);

    const query: any = { eventId: eventObjId };
    if (statusFilter) query.rsvpStatus = statusFilter;

    return rsvpsCollection.find(query).sort({ createdAt: 1 }).toArray();
  }

  /**
   * Get a single RSVP by event and attendee email
   */
  static async getRsvpByEmailAndEvent(
    eventId: string,
    userEmail: string
  ): Promise<EventRSVPDocument | null> {
    const rsvpsCollection = await getCollection<EventRSVPDocument>(this.RSVPS_COLLECTION);
    return rsvpsCollection.findOne({ eventId: new ObjectId(eventId), userEmail });
  }

  /**
   * Get or create a referral code for an alumni for a specific event.
   */
  static async getOrCreateReferralCode(eventId: string, referrerEmail: string): Promise<string> {
    const col = await getCollection<EventReferralDocument>(this.REFERRALS_COLLECTION);
    const normalizedEmail = referrerEmail.trim().toLowerCase();
    const eventObjectId = new ObjectId(eventId);
    const existing = await col.findOne({ eventId: eventObjectId, referrerEmail: normalizedEmail });
    if (existing) return existing.referralCode;

    for (let attempt = 0; attempt < this.MAX_REFERRAL_CODE_GENERATION_ATTEMPTS; attempt++) {
      const referralCode = randomBytes(this.REFERRAL_CODE_BYTE_LENGTH).toString('hex');
      try {
        await col.insertOne({
          eventId: eventObjectId,
          referrerEmail: normalizedEmail,
          referralCode,
          clickCount: 0,
          rsvpCount: 0,
          createdAt: new Date(),
        });
        return referralCode;
      } catch (error) {
        const isDuplicateKey =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 11000;
        if (!isDuplicateKey) throw error;

        const insertedByAnotherRequest = await col.findOne({
          eventId: eventObjectId,
          referrerEmail: normalizedEmail,
        });
        if (insertedByAnotherRequest) {
          return insertedByAnotherRequest.referralCode;
        }
      }
    }

    throw new Error('Failed to generate a unique referral code');
  }

  /**
   * Increment click count for a referral code.
   */
  static async incrementReferralClick(eventId: string, referralCode: string): Promise<void> {
    const col = await getCollection<EventReferralDocument>(this.REFERRALS_COLLECTION);
    await col.updateOne(
      { eventId: new ObjectId(eventId), referralCode },
      { $inc: { clickCount: 1 } }
    );
  }

  /**
   * Increment RSVP count for a referral code.
   */
  static async incrementReferralRsvp(
    eventId: string,
    referralCode: string,
    attendeeEmail: string
  ): Promise<void> {
    const col = await getCollection<EventReferralDocument>(this.REFERRALS_COLLECTION);
    const normalizedAttendeeEmail = attendeeEmail.trim().toLowerCase();
    const query = {
      eventId: new ObjectId(eventId),
      referralCode,
      // Do not credit referrals when the attendee is the same alumni who created the code.
      referrerEmail: { $ne: normalizedAttendeeEmail },
    };
    await col.updateOne(
      query,
      { $inc: { rsvpCount: 1 } }
    );
  }

  /**
   * Get referral stats for an event (admin use).
   */
  static async getReferralStats(eventId: string): Promise<EventReferralDocument[]> {
    const col = await getCollection<EventReferralDocument>(this.REFERRALS_COLLECTION);
    return col.find({ eventId: new ObjectId(eventId) }).sort({ clickCount: -1 }).toArray();
  }

  /**
   * Create a networking room
   */
  static async createNetworkingRoom(
    eventId: string,
    name: string,
    topic?: string
  ): Promise<NetworkingRoomDocument> {
    const collection = await getCollection<NetworkingRoomDocument>(this.ROOMS_COLLECTION);

    const doc: NetworkingRoomDocument = {
      eventId: new ObjectId(eventId),
      name,
      topic,
      isActive: true,
      createdAt: new Date(),
    };

    const result = await collection.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }

  /**
   * Get active networking rooms with message counts
   */
  static async getRooms(eventId: string): Promise<any[]> {
    const collection = await getCollection<NetworkingRoomDocument>(this.ROOMS_COLLECTION);
    const eventObjId = new ObjectId(eventId);

    const pipeline: any[] = [
      { $match: { eventId: eventObjId, isActive: true } },
      { $sort: { createdAt: 1 } },
      {
        $lookup: {
          from: this.MESSAGES_COLLECTION,
          localField: '_id',
          foreignField: 'roomId',
          as: 'messages',
        },
      },
      {
        $addFields: {
          messageCount: { $size: '$messages' },
        },
      },
      { $project: { messages: 0 } },
    ];

    return collection.aggregate(pipeline).toArray();
  }

  /**
   * Update RSVP status (admin use)
   */
  static async updateRsvpStatus(
    eventId: string,
    userEmail: string,
    rsvpStatus: 'confirmed' | 'waitlisted' | 'cancelled'
  ): Promise<boolean> {
    const rsvpsCollection = await getCollection<EventRSVPDocument>(this.RSVPS_COLLECTION);
    const result = await rsvpsCollection.updateOne(
      { eventId: new ObjectId(eventId), userEmail },
      { $set: { rsvpStatus } }
    );
    return result.matchedCount > 0;
  }

  /**
   * Get all networking rooms (including inactive) — for admin use
   */
  static async getAllRooms(eventId: string): Promise<any[]> {
    const collection = await getCollection<NetworkingRoomDocument>(this.ROOMS_COLLECTION);
    const eventObjId = new ObjectId(eventId);

    const pipeline: any[] = [
      { $match: { eventId: eventObjId } },
      { $sort: { createdAt: 1 } },
      {
        $lookup: {
          from: this.MESSAGES_COLLECTION,
          localField: '_id',
          foreignField: 'roomId',
          as: 'messages',
        },
      },
      {
        $addFields: {
          messageCount: { $size: '$messages' },
        },
      },
      { $project: { messages: 0 } },
    ];

    return collection.aggregate(pipeline).toArray();
  }

  /**
   * Update a networking room (name, topic, isActive)
   */
  static async updateRoom(
    roomId: string,
    updates: { name?: string; topic?: string; isActive?: boolean }
  ): Promise<boolean> {
    const collection = await getCollection<NetworkingRoomDocument>(this.ROOMS_COLLECTION);
    const result = await collection.updateOne(
      { _id: new ObjectId(roomId) },
      { $set: updates }
    );
    return result.matchedCount > 0;
  }

  /**
   * Delete a networking room
   */
  static async deleteRoom(roomId: string): Promise<boolean> {
    const collection = await getCollection<NetworkingRoomDocument>(this.ROOMS_COLLECTION);
    const result = await collection.deleteOne({ _id: new ObjectId(roomId) });
    return result.deletedCount > 0;
  }

  /**
   * Post a message to a room
   */
  static async postMessage(
    roomId: string,
    userEmail: string,
    userName: string | undefined,
    message: string
  ): Promise<RoomMessageDocument> {
    const collection = await getCollection<RoomMessageDocument>(this.MESSAGES_COLLECTION);

    const doc: RoomMessageDocument = {
      roomId: new ObjectId(roomId),
      userEmail,
      userName,
      message,
      createdAt: new Date(),
    };

    const result = await collection.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }

  /**
   * Get messages in a room
   */
  static async getMessages(
    roomId: string,
    limit: number = 50
  ): Promise<RoomMessageDocument[]> {
    const collection = await getCollection<RoomMessageDocument>(this.MESSAGES_COLLECTION);

    return collection
      .find({ roomId: new ObjectId(roomId) })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();
  }

  // ── Discussion ──────────────────────────────────────────────────────────────

  /**
   * Get discussion posts for an event, sorted by createdAt ascending.
   */
  static async getDiscussionPosts(eventId: string): Promise<DiscussionPostDocument[]> {
    const col = await getCollection<DiscussionPostDocument>(this.DISCUSSION_COLLECTION);
    return col.find({ eventId: new ObjectId(eventId) }).sort({ createdAt: 1 }).limit(this.MAX_DISCUSSION_POSTS).toArray();
  }

  /**
   * Add a new discussion post for an event.
   */
  static async addDiscussionPost(
    eventId: string,
    authorEmail: string,
    authorName: string | undefined,
    content: string,
    isAnonymous?: boolean
  ): Promise<DiscussionPostDocument> {
    const col = await getCollection<DiscussionPostDocument>(this.DISCUSSION_COLLECTION);
    const doc: DiscussionPostDocument = {
      eventId: new ObjectId(eventId),
      authorEmail,
      authorName,
      content,
      isAnonymous: !!isAnonymous,
      createdAt: new Date(),
    };
    const result = await col.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }

  /**
   * Delete a discussion post by ID.
   */
  static async deleteDiscussionPost(postId: string): Promise<boolean> {
    const col = await getCollection<DiscussionPostDocument>(this.DISCUSSION_COLLECTION);
    const result = await col.deleteOne({ _id: new ObjectId(postId) });
    return result.deletedCount > 0;
  }

  /**
   * Get a single discussion post by ID.
   */
  static async getDiscussionPost(postId: string): Promise<DiscussionPostDocument | null> {
    const col = await getCollection<DiscussionPostDocument>(this.DISCUSSION_COLLECTION);
    return col.findOne({ _id: new ObjectId(postId) });
  }

  // ── Feedback ─────────────────────────────────────────────────────────────────

  /**
   * Submit feedback for an event. Throws if the user has already submitted.
   */
  static async submitFeedback(
    eventId: string,
    userEmail: string,
    data: { rating: number; wouldRecommend: boolean; highlights?: string; improvements?: string }
  ): Promise<EventFeedbackDocument> {
    const col = await getCollection<EventFeedbackDocument>(this.FEEDBACK_COLLECTION);
    const doc: EventFeedbackDocument = {
      eventId: new ObjectId(eventId),
      userEmail,
      rating: data.rating as 1 | 2 | 3 | 4 | 5,
      wouldRecommend: data.wouldRecommend,
      highlights: data.highlights,
      improvements: data.improvements,
      createdAt: new Date(),
    };
    try {
      const result = await col.insertOne(doc);
      return { ...doc, _id: result.insertedId };
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new Error('You have already submitted feedback for this event.');
      }
      throw err;
    }
  }

  /**
   * Get aggregate feedback summary for an event.
   */
  static async getFeedbackSummary(
    eventId: string
  ): Promise<{ count: number; avgRating: number; recommendPct: number; feedbacks: EventFeedbackDocument[] }> {
    const col = await getCollection<EventFeedbackDocument>(this.FEEDBACK_COLLECTION);
    const feedbacks = await col.find({ eventId: new ObjectId(eventId) }).toArray();
    const count = feedbacks.length;
    if (count === 0) {
      return { count: 0, avgRating: 0, recommendPct: 0, feedbacks: [] };
    }
    const precision = Math.pow(10, this.RATING_PRECISION);
    const avgRating = Math.round((feedbacks.reduce((sum, f) => sum + f.rating, 0) / count) * precision) / precision;
    const recommendPct = Math.round((feedbacks.filter(f => f.wouldRecommend).length / count) * 100);
    return { count, avgRating, recommendPct, feedbacks };
  }

  /**
   * Get a single user's feedback for an event.
   */
  static async getUserFeedback(eventId: string, userEmail: string): Promise<EventFeedbackDocument | null> {
    const col = await getCollection<EventFeedbackDocument>(this.FEEDBACK_COLLECTION);
    return col.findOne({ eventId: new ObjectId(eventId), userEmail });
  }

  // ── Recurring Events & Series (Feature 10) ────────────────────────────────

  /**
   * Create a recurring event series — generates N child events via insertMany.
   * Returns the parentEvent plus all generated childEvents.
   */
  static async createRecurringEvent(
    data: Omit<EventDocument, '_id' | 'slug' | 'createdAt' | 'updatedAt'> & {
      recurrence: { frequency: 'weekly' | 'monthly'; interval: number; until?: Date; occurrences?: number; };
    }
  ): Promise<{ parentEvent: EventDocument; childEvents: EventDocument[] }> {
    const MAX_CHILDREN = 52;
    const seriesId = new ObjectId();

    // Create the parent event
    const parentEvent = await this.createEvent({ ...data, seriesId });

    const { recurrence } = data;
    const frequency = recurrence.frequency;
    const interval = Math.max(1, recurrence.interval || 1);
    const maxOccurrences = Math.min(MAX_CHILDREN, recurrence.occurrences || MAX_CHILDREN);
    const until = recurrence.until ? new Date(recurrence.until) : undefined;

    const collection = await getCollection<EventDocument>(this.EVENTS_COLLECTION);
    const childDocs: EventDocument[] = [];

    let currentStart = new Date(parentEvent.startTime);
    let currentEnd = new Date(parentEvent.endTime);
    const duration = currentEnd.getTime() - currentStart.getTime();
    const regDeadlineOffset = parentEvent.registrationDeadline
      ? parentEvent.registrationDeadline.getTime() - currentStart.getTime()
      : null;

    for (let i = 0; i < maxOccurrences; i++) {
      // Advance by interval weeks or months
      if (frequency === 'weekly') {
        currentStart = new Date(currentStart.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
      } else {
        // monthly
        const next = new Date(currentStart);
        next.setMonth(next.getMonth() + interval);
        currentStart = next;
      }

      if (until && currentStart > until) break;

      currentEnd = new Date(currentStart.getTime() + duration);
      const now = new Date();
      const childSlug = `${slugify(parentEvent.title)}-${currentStart.getTime()}`;

      const childDoc: EventDocument = {
        ...data,
        seriesId,
        parentEventId: parentEvent._id,
        slug: childSlug,
        startTime: new Date(currentStart),
        endTime: new Date(currentEnd),
        registrationDeadline:
          regDeadlineOffset !== null
            ? new Date(currentStart.getTime() + regDeadlineOffset)
            : undefined,
        createdAt: now,
        updatedAt: now,
      };
      childDocs.push(childDoc);
    }

    if (childDocs.length > 0) {
      const result = await collection.insertMany(childDocs);
      childDocs.forEach((doc, idx) => {
        doc._id = result.insertedIds[idx];
      });
    }

    return { parentEvent, childEvents: childDocs };
  }

  /**
   * Get all events in a series, sorted by startTime.
   */
  static async getSeriesEvents(seriesId: string): Promise<EventDocument[]> {
    const collection = await getCollection<EventDocument>(this.EVENTS_COLLECTION);
    return collection
      .find({ seriesId: new ObjectId(seriesId) })
      .sort({ startTime: 1 })
      .toArray();
  }

  /**
   * Create or fetch a named series.
   */
  static async getOrCreateSeries(
    name: string,
    hostEmail: string,
    description?: string
  ): Promise<EventSeriesDocument> {
    const col = await getCollection<EventSeriesDocument>(this.SERIES_COLLECTION);
    const existing = await col.findOne({ name, hostEmail });
    if (existing) return existing;
    const doc: EventSeriesDocument = {
      name,
      description,
      hostEmail,
      createdAt: new Date(),
    };
    const result = await col.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }

  /**
   * Set up MongoDB indexes for Q&A and Polls collections
   */
  static async setupQAAndPollIndexes(): Promise<void> {
    const qaCol = await getCollection('event_qa');
    await qaCol.createIndex({ eventId: 1, upvotes: -1, createdAt: 1 });

    const pollsCol = await getCollection('event_polls');
    await pollsCol.createIndex({ eventId: 1, isActive: 1 });
    await pollsCol.createIndex({ eventId: 1, createdAt: -1 });
  }

  /**
   * Set up all MongoDB indexes
   */
  static async setupIndexes(): Promise<void> {
    const eventsCol = await getCollection<EventDocument>(this.EVENTS_COLLECTION);
    const rsvpsCol = await getCollection<EventRSVPDocument>(this.RSVPS_COLLECTION);
    const referralsCol = await getCollection<EventReferralDocument>(this.REFERRALS_COLLECTION);
    const roomsCol = await getCollection<NetworkingRoomDocument>(this.ROOMS_COLLECTION);
    const messagesCol = await getCollection<RoomMessageDocument>(this.MESSAGES_COLLECTION);
    const discussionCol = await getCollection(this.DISCUSSION_COLLECTION);
    const feedbackCol = await getCollection(this.FEEDBACK_COLLECTION);

    await Promise.all([
      eventsCol.createIndex({ slug: 1 }, { unique: true }),
      eventsCol.createIndex({ status: 1 }),
      eventsCol.createIndex({ startTime: 1 }),
      eventsCol.createIndex({ seriesId: 1 }),
      eventsCol.createIndex({ isFeatured: 1 }),

      rsvpsCol.createIndex({ eventId: 1, userEmail: 1 }, { unique: true }),
      rsvpsCol.createIndex({ eventId: 1, rsvpStatus: 1 }),
      rsvpsCol.createIndex({ reminderSent: 1 }),

      referralsCol.createIndex({ eventId: 1, referrerEmail: 1 }, { unique: true }),
      referralsCol.createIndex({ referralCode: 1 }, { unique: true }),

      roomsCol.createIndex({ eventId: 1, isActive: 1 }),

      messagesCol.createIndex({ roomId: 1, createdAt: 1 }),

      discussionCol.createIndex({ eventId: 1, createdAt: 1 }),
      feedbackCol.createIndex({ eventId: 1, userEmail: 1 }, { unique: true }),
      feedbackCol.createIndex({ eventId: 1 }),
    ]);

    // Text index for full-text search (Feature 11) — in separate try/catch to
    // degrade gracefully if an incompatible text index already exists.
    try {
      await eventsCol.createIndex({ title: 'text', description: 'text' });
    } catch {
      // ignore — text index may already exist in a different form
    }

    // Series collection index
    const seriesCol = await getCollection(this.SERIES_COLLECTION);
    await seriesCol.createIndex({ hostEmail: 1 });
  }
}
