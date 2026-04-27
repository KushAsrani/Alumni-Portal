import { ObjectId } from 'mongodb';

export interface EventDocument {
  _id?: ObjectId;
  title: string;
  slug: string;
  description?: string;
  hostEmail: string;
  hostName?: string;   // display name for host
  eventType: 'webinar' | 'ama' | 'workshop';
  startTime: Date;
  endTime: Date;
  capacity: number;
  meetingUrl?: string;
  meetingUrlActive?: boolean;  // default false — admin must activate before it's shown to attendees
  bannerUrl?: string;
  venue?: string;      // e.g. "Main Campus Auditorium, NCIT" or "Online"
  location?: string;   // physical address or "Remote/Online"
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
  mobile?: string;
  faculty?: string;
  graduationYear?: number;
  hasGuest?: boolean;
  guestName?: string;
  guestEmail?: string;
  guestMobile?: string;
  guestFaculty?: string;
  guestYear?: number;
  guestCount?: number;
  guests?: Array<{ name?: string; email?: string; mobile?: string; faculty?: string; year?: number }>;
  activities?: string[];
  comments?: string;
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
