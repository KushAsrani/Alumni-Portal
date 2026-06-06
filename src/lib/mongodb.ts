import { MongoClient, Db } from 'mongodb';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const uri = import.meta.env.MONGODB_URI || process.env.MONGODB_URI;
  
  if (!uri) {
    throw new Error('Please define MONGODB_URI in your environment variables');
  }

  const client = await MongoClient.connect(uri);
  const db = client.db('alumni_portal');

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

// Type definitions
export interface AlumniRegistration {
  _id?: string;
  name: string;
  email: string;
  mobile?: string;
  dob?: string;
  gender?: string;
  address?: string;
  
  // Education
  year?: number;
  faculty?: string;
  degree?: string;
  university?: string;
  college_name?: string;
  gpa?: string;
  
  // Professional
  job_designation?: string;
  company?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  twitter?: string;
  portfolio?: string;
  
  // Content
  skills?: string | string[];
  projects?: string;
  work_experience?: string;
  interests?: string;
  short_bio?: string;
  open_to_mentorship?: boolean;
  open_to_work?: boolean;
  open_to_referral?: boolean;
  skill_readiness?: Record<string, 'beginner' | 'intermediate' | 'advanced' | 'expert'>;
  
  // Files
  photo_blob_url?: string;
  degree_certificate_url?: string;

  // Login Credentials (NEW)
  username?: string;
  password_hash?: string;
  
  // Meta
  status: 'pending' | 'approved' | 'rejected';
  login_enabled: boolean;        // NEW: set to true when admin approves
  last_login?: Date;             // NEW: track last login
  password_changed_at?: Date;
  created_at: Date;
  updated_at: Date;
  is_verified?: boolean;
  verified_at?: Date | null;
  verified_by?: string | null;
  gdpr_deletion_requested?: boolean;
  gdpr_deletion_requested_at?: Date | null;
  gdpr_deletion_request_reason?: string;
  notification_preferences?: {
    connection_requests?: boolean;
    upcoming_events?: boolean;
    mentorship_requests?: boolean;
    weekly_digest?: boolean;
    digest_frequency?: 'daily' | 'weekly' | 'never';
    notify_on_verification?: boolean;
  };
  profile_visibility?: {
    show_in_directory?: boolean;
    show_email_publicly?: boolean;
    allow_connection_requests?: boolean;
  };
  mentorship_preferences?: {
    looking_for_mentor?: boolean;
    preferred_mode?: 'online' | 'in-person' | 'either';
  };
  connected_accounts?: {
    linkedin_connected?: boolean;
    github_connected?: boolean;
    linkedin_url?: string;
    github_url?: string;
  };
  accessibility?: {
    preferred_language?: string;
  };
  two_fa_enabled?: boolean;
  two_fa_secret?: string | null;
  two_fa_backup_codes?: string[];
  is_flagged?: boolean;
  flag_reason?: string;
  flag_reported_at?: Date | null;
  flag_reported_by?: string | null;
  flag_resolved?: boolean;
  flag_resolved_at?: Date | null;
}

// Create indexes for better performance
export async function setupIndexes() {
  const { db } = await connectToDatabase();
  const collection = db.collection('alumni_registrations');
  
  await collection.createIndex({ email: 1 }, { unique: true });
  await collection.createIndex({ username: 1 }, { unique: true, sparse: true }); // NEW
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ created_at: -1 });
  await collection.createIndex({ year: 1 });
  await collection.createIndex({ faculty: 1 });
}