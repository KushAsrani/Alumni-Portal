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
  registrationDeadline?: Date;   // optional deadline for RSVP/registration; falls back to startTime if not set
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
  qrToken?: string;
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

export interface QAQuestionDocument {
  _id?: ObjectId;
  eventId: ObjectId;
  authorEmail: string;
  authorName?: string;
  text: string;
  upvotes: number;
  upvotedBy: string[];   // emails that have upvoted
  answered: boolean;
  answer?: string;
  answeredAt?: Date;
  isAnonymous?: boolean;
  createdAt: Date;
}

export interface PollDocument {
  _id?: ObjectId;
  eventId: ObjectId;
  question: string;
  options: string[];
  votes: Record<string, string>;  // voterEmail → optionIndex (as string)
  isActive: boolean;
  createdAt: Date;
}

export interface EventReferralDocument {
  _id?: ObjectId;
  eventId: ObjectId;
  referrerEmail: string;
  referralCode: string;
  clickCount: number;
  rsvpCount: number;
  createdAt: Date;
}

export interface DiscussionPostDocument {
  _id?: ObjectId;
  eventId: ObjectId;
  authorEmail: string;
  authorName?: string;
  content: string;
  isAnonymous?: boolean;
  createdAt: Date;
}

export interface EventFeedbackDocument {
  _id?: ObjectId;
  eventId: ObjectId;
  userEmail: string;
  rating: 1 | 2 | 3 | 4 | 5;
  wouldRecommend: boolean;
  highlights?: string;
  improvements?: string;
  createdAt: Date;
}
