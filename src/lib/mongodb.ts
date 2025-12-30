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
  skills?: string;
  projects?: string;
  work_experience?: string;
  interests?: string;
  short_bio?: string;
  
  // Files
  photo_blob_url?: string;
  degree_certificate_url?: string;
  
  // Meta
  status: 'pending' | 'approved' | 'rejected';
  created_at: Date;
  updated_at: Date;
}

// Create indexes for better performance
export async function setupIndexes() {
  const { db } = await connectToDatabase();
  const collection = db.collection('alumni_registrations');
  
  await collection.createIndex({ email: 1 }, { unique: true });
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ created_at: -1 });
  await collection.createIndex({ year: 1 });
  await collection.createIndex({ faculty: 1 });
}