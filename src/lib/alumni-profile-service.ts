import { ObjectId } from 'mongodb';
import { connectToDatabase } from './mongodb';

export const ALUMNI_PROFILES_COLLECTION = 'alumni_profiles';

export function generateProfileSlug(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

export function toProjectsArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (!value) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed as Record<string, unknown>];
    } catch {
      return trimmed
        .split('\n')
        .map((project) => project.trim())
        .filter(Boolean)
        .map((project) => ({ name: project, description: '' }));
    }
  }

  if (typeof value === 'object') return [value as Record<string, unknown>];
  return [];
}

function pickProfilePhoto(registration: any): string {
  return registration.photo_blob_url || registration.photo || '/images/avatars/default-avatar.svg';
}

export function buildAlumniProfileDocument(registration: any) {
  const slug = registration.slug || generateProfileSlug(registration.name || '');
  const skills = toStringArray(registration.skills);
  const interests = toStringArray(registration.interests);
  const projects = toProjectsArray(registration.projects);
  const now = new Date();

  return {
    registration_id: registration._id instanceof ObjectId ? registration._id : new ObjectId(registration._id),
    name: registration.name || '',
    slug,
    faculty: registration.faculty || 'N/A',
    year: registration.year ? Number(registration.year) : null,
    short_bio: registration.short_bio || '',
    long_bio: registration.long_bio || registration.short_bio || '',
    photo: pickProfilePhoto(registration),
    photo_blob_url: registration.photo_blob_url || null,
    email: registration.email || '',
    mobile: registration.mobile || '',
    location: registration.location || '',
    company: registration.company || '',
    position: registration.job_designation || registration.position || '',
    job_designation: registration.job_designation || registration.position || '',
    degree: registration.degree || '',
    university: registration.university || '',
    college_name: registration.college_name || '',
    gpa: registration.gpa || '',
    skills,
    projects,
    work_experience: registration.work_experience
      ? [
          {
            company: registration.company || 'N/A',
            position: registration.job_designation || registration.position || 'N/A',
            duration: `${registration.year || ''} - Present`.trim(),
            description: registration.work_experience,
          },
        ]
      : [],
    education: registration.university || registration.degree || registration.faculty || registration.college_name
      ? [
          {
            degree: `${registration.faculty || ''}`.trim(),
            institution: `${registration.college_name || ''}`.trim(),
            university: `${registration.university || ''}`.trim(),
            year: registration.year ? Number(registration.year) : null,
            gpa: registration.gpa || '',
          },
        ]
      : [],
    achievements: Array.isArray(registration.achievements) ? registration.achievements : [],
    interests,
    social: {
      portfolio: registration.portfolio || null,
      linkedin: registration.linkedin || null,
      twitter: registration.twitter || null,
      github: registration.github || null,
    },
    open_to_mentorship: Boolean(registration.open_to_mentorship),
    open_to_work: Boolean(registration.open_to_work),
    open_to_referral: Boolean(registration.open_to_referral),
    status: 'approved',
    is_verified: Boolean(registration.is_verified),
    source_collection: 'alumni_registrations',
    updated_at: now,
    created_at: registration.created_at || now,
  };
}

export async function ensureAlumniProfileIndexes() {
  const { db } = await connectToDatabase();
  const collection = db.collection(ALUMNI_PROFILES_COLLECTION);

  await Promise.all([
    collection.createIndex({ registration_id: 1 }, { unique: true }),
    collection.createIndex({ slug: 1 }, { unique: true }),
    collection.createIndex({ email: 1 }, { unique: true, sparse: true }),
    collection.createIndex({ status: 1 }),
    collection.createIndex({ faculty: 1 }),
    collection.createIndex({ year: 1 }),
    collection.createIndex({ updated_at: -1 }),
  ]);
}

export async function upsertAlumniProfileFromRegistration(registration: any) {
  const { db } = await connectToDatabase();
  const profiles = db.collection(ALUMNI_PROFILES_COLLECTION);
  const profileDocument = buildAlumniProfileDocument(registration);

  await ensureAlumniProfileIndexes();

  const result = await profiles.findOneAndUpdate(
    { registration_id: profileDocument.registration_id },
    { $set: profileDocument },
    { upsert: true, returnDocument: 'after' },
  );

  return result;
}
