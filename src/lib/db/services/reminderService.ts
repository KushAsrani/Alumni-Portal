import { getCollection } from '../mongodb.ts';
import { ObjectId } from 'mongodb';
import type { EventRSVPDocument, EventDocument } from '../models/Event';

export interface NotifyMeDocument {
  _id?: ObjectId;
  eventId: ObjectId;
  userEmail: string;
  userName?: string;
  createdAt: Date;
}

export class ReminderService {
  private static readonly RSVPS_COLLECTION = 'event_rsvps';
  private static readonly EVENTS_COLLECTION = 'events';
  private static readonly NOTIFY_ME_COLLECTION = 'event_notify_me';

  /**
   * Subscribe a user to "notify me when join link goes live" for an event.
   * Upserts — calling twice for the same email+event is idempotent.
   */
  static async subscribeNotifyMe(eventId: string, userEmail: string, userName?: string): Promise<void> {
    const col = await getCollection<NotifyMeDocument>(this.NOTIFY_ME_COLLECTION);
    const eventObjId = new ObjectId(eventId);
    await col.updateOne(
      { eventId: eventObjId, userEmail },
      {
        $set: { eventId: eventObjId, userEmail, userName },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
  }

  /**
   * Unsubscribe a user from notify-me for an event.
   */
  static async unsubscribeNotifyMe(eventId: string, userEmail: string): Promise<void> {
    const col = await getCollection<NotifyMeDocument>(this.NOTIFY_ME_COLLECTION);
    await col.deleteOne({ eventId: new ObjectId(eventId), userEmail });
  }

  /**
   * Check if a user is subscribed to notify-me for an event.
   */
  static async isSubscribed(eventId: string, userEmail: string): Promise<boolean> {
    const col = await getCollection<NotifyMeDocument>(this.NOTIFY_ME_COLLECTION);
    const doc = await col.findOne({ eventId: new ObjectId(eventId), userEmail });
    return !!doc;
  }

  /**
   * Get all notify-me subscribers for an event.
   */
  static async getNotifyMeSubscribers(eventId: string): Promise<NotifyMeDocument[]> {
    const col = await getCollection<NotifyMeDocument>(this.NOTIFY_ME_COLLECTION);
    return col.find({ eventId: new ObjectId(eventId) }).toArray();
  }

  /**
   * Get confirmed RSVPs that need reminders sent (reminderSent: false, event starts within threshold).
   * hoursThreshold: 24 or 1
   */
  static async getRsvpsDueForReminder(hoursThreshold: number): Promise<Array<{ rsvp: EventRSVPDocument; event: EventDocument }>> {
    const rsvpsCol = await getCollection<EventRSVPDocument>(this.RSVPS_COLLECTION);
    const eventsCol = await getCollection<EventDocument>(this.EVENTS_COLLECTION);

    const now = new Date();
    const windowStart = new Date(now.getTime() + (hoursThreshold - 0.5) * 60 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() + (hoursThreshold + 0.5) * 60 * 60 * 1000);

    // Find events starting in the window
    const upcomingEvents = await eventsCol.find({
      status: 'upcoming',
      startTime: { $gte: windowStart, $lte: windowEnd },
    }).toArray();

    if (upcomingEvents.length === 0) return [];

    const eventIds = upcomingEvents.map(e => e._id!);

    // Use a composite reminderSent field per threshold: reminder24Sent / reminder1Sent
    const reminderField = hoursThreshold === 24 ? 'reminder24Sent' : 'reminder1Sent';
    const rsvps = await rsvpsCol.find({
      eventId: { $in: eventIds },
      rsvpStatus: 'confirmed',
      [reminderField]: { $ne: true },
    }).toArray();

    const eventMap = new Map(upcomingEvents.map(e => [e._id!.toString(), e]));

    return rsvps.map(rsvp => ({
      rsvp,
      event: eventMap.get(rsvp.eventId.toString())!,
    })).filter(item => item.event);
  }

  /**
   * Mark a reminder as sent for a specific threshold (24h or 1h).
   */
  static async markReminderSent(rsvpId: ObjectId, hoursThreshold: number): Promise<void> {
    const rsvpsCol = await getCollection<EventRSVPDocument>(this.RSVPS_COLLECTION);
    const reminderField = hoursThreshold === 24 ? 'reminder24Sent' : 'reminder1Sent';
    await rsvpsCol.updateOne({ _id: rsvpId }, { $set: { [reminderField]: true, reminderSent: true } });
    // reminderSent is the generic field from EventRSVPDocument, kept for backward compatibility
    // with any queries that check whether any reminder has been sent for this RSVP.
  }

  /**
   * Set up MongoDB indexes for the new collection.
   */
  static async setupIndexes(): Promise<void> {
    const col = await getCollection<NotifyMeDocument>(this.NOTIFY_ME_COLLECTION);
    await col.createIndex({ eventId: 1, userEmail: 1 }, { unique: true });
    await col.createIndex({ eventId: 1 });
  }
}
