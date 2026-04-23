import { ObjectId } from 'mongodb';

export interface EventDocument {
  _id?: ObjectId;
  title: string;
  slug: string;
  description?: string;
  hostEmail: string;
  eventType: 'webinar' | 'ama' | 'workshop';
  startTime: Date;
  endTime: Date;
  capacity: number;
  meetingUrl?: string;
  status: 'upcoming' | 'live' | 'ended' | 'cancelled';
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EventRSVPDocument {
  _id?: ObjectId;
  eventId: ObjectId;
  userEmail: string;
  userName?: string;
  rsvpStatus: 'confirmed' | 'waitlisted' | 'cancelled';
  checkedIn: boolean;
  checkedInAt?: Date;
  reminderSent: boolean;
  createdAt: Date;
}

export interface NetworkingRoomDocument {
  _id?: ObjectId;
  eventId: ObjectId;
  name: string;
  topic?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface RoomMessageDocument {
  _id?: ObjectId;
  roomId: ObjectId;
  userEmail: string;
  userName?: string;
  message: string;
  createdAt: Date;
}
