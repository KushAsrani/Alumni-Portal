import { getCollection } from '../mongodb.ts';
import type {
  EventDocument,
  EventRSVPDocument,
  NetworkingRoomDocument,
  RoomMessageDocument,
} from '../models/Event';
import { ObjectId } from 'mongodb';

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
  private static readonly ROOMS_COLLECTION = 'networking_rooms';
  private static readonly MESSAGES_COLLECTION = 'room_messages';

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
  } = {}): Promise<{ events: any[]; total: number }> {
    const collection = await getCollection<EventDocument>(this.EVENTS_COLLECTION);

    const query: any = {};
    if (filters.status) query.status = filters.status;
    if (filters.slug) query.slug = filters.slug;

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    const pipeline: any[] = [
      { $match: query },
      { $sort: { startTime: 1 } },
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

    const now = new Date();
    const doc: EventRSVPDocument = {
      eventId: eventObjId,
      userEmail,
      userName,
      rsvpStatus,
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
    return { status: rsvpStatus, rsvp: { ...doc, _id: result.insertedId } };
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

  /**
   * Set up all MongoDB indexes
   */
  static async setupIndexes(): Promise<void> {
    const eventsCol = await getCollection<EventDocument>(this.EVENTS_COLLECTION);
    const rsvpsCol = await getCollection<EventRSVPDocument>(this.RSVPS_COLLECTION);
    const roomsCol = await getCollection<NetworkingRoomDocument>(this.ROOMS_COLLECTION);
    const messagesCol = await getCollection<RoomMessageDocument>(this.MESSAGES_COLLECTION);

    await Promise.all([
      eventsCol.createIndex({ slug: 1 }, { unique: true }),
      eventsCol.createIndex({ status: 1 }),
      eventsCol.createIndex({ startTime: 1 }),

      rsvpsCol.createIndex({ eventId: 1, userEmail: 1 }, { unique: true }),
      rsvpsCol.createIndex({ eventId: 1, rsvpStatus: 1 }),
      rsvpsCol.createIndex({ reminderSent: 1 }),

      roomsCol.createIndex({ eventId: 1, isActive: 1 }),

      messagesCol.createIndex({ roomId: 1, createdAt: 1 }),
    ]);
  }
}
