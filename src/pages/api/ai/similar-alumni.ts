export const prerender = false;

import type { APIRoute } from 'astro';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../../../lib/mongodb';
import type { AlumniRegistration } from '../../../lib/mongodb';

const PYTHON_API_URL = import.meta.env.PYTHON_API_URL || process.env.PYTHON_API_URL || 'http://localhost:5001';
const REQUEST_TIMEOUT_MS = 3000;

interface SimilarAlumniRequest {
  alumni_id?: string;
}

interface SimilarAlumniResponse {
  alumni: SimilarAlumniRecord[];
  message: string;
  source: 'python' | 'mongodb';
}

interface SimilarAlumniRecord {
  _id: string;
  name: string;
  faculty?: string;
  year?: number;
  company?: string;
  job_designation?: string;
  photo_blob_url?: string;
  skills: string[];
  location?: string;
  is_verified: boolean;
}

type AlumniDocument = AlumniRegistration & { _id: ObjectId | string };

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function toYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function serializeAlumni(alumni: Partial<AlumniDocument>): SimilarAlumniRecord {
  return {
    _id: String(alumni._id ?? ''),
    name: alumni.name || 'Alumni',
    faculty: alumni.faculty,
    year: typeof alumni.year === 'number' ? alumni.year : toYear(alumni.year) ?? undefined,
    company: alumni.company,
    job_designation: alumni.job_designation,
    photo_blob_url: alumni.photo_blob_url,
    skills: toStringArray(alumni.skills),
    location: alumni.location,
    is_verified: Boolean(alumni.is_verified),
  };
}

async function tryPythonApi(body: SimilarAlumniRequest): Promise<SimilarAlumniResponse | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${PYTHON_API_URL}/api/ai/similar-alumni`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return {
      alumni: Array.isArray(data?.alumni) ? data.alumni.map((item: Partial<AlumniDocument>) => serializeAlumni(item)) : [],
      message: typeof data?.message === 'string' ? data.message : 'Showing similar alumni from AI recommendations.',
      source: 'python',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRequestingAlumni(alumniId: string): Promise<AlumniDocument | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<AlumniDocument>('alumni_registrations');

  if (!ObjectId.isValid(alumniId)) {
    return null;
  }

  return collection.findOne({ _id: new ObjectId(alumniId) });
}

async function buildMongoFallback(alumniId: string): Promise<SimilarAlumniResponse> {
  const { db } = await connectToDatabase();
  const collection = db.collection<AlumniDocument>('alumni_registrations');
  const requester = await fetchRequestingAlumni(alumniId);

  if (!requester) {
    return {
      alumni: [],
      message: 'We could not load your profile to find similar alumni right now.',
      source: 'mongodb',
    };
  }

  const requesterSkills = new Set(toStringArray(requester.skills).map((skill) => normalizeText(skill)));
  const requesterFaculty = normalizeText(requester.faculty);
  const requesterCompany = normalizeText(requester.company);
  const requesterYear = toYear(requester.year);

  if (requesterSkills.size === 0 || !requesterFaculty) {
    return {
      alumni: [],
      message: 'Add skills and faculty to your profile to see similar alumni.',
      source: 'mongodb',
    };
  }

  const candidates = await collection
    .find({
      status: 'approved',
      _id: { $ne: requester._id as ObjectId },
    })
    .project({
      name: 1,
      faculty: 1,
      year: 1,
      company: 1,
      job_designation: 1,
      photo_blob_url: 1,
      skills: 1,
      location: 1,
      is_verified: 1,
    })
    .toArray();

  const ranked = candidates
    .map((candidate) => {
      const candidateSkills = toStringArray(candidate.skills).map((skill) => normalizeText(skill));
      const matchingSkills = candidateSkills.filter((skill) => requesterSkills.has(skill)).length;

      let score = matchingSkills * 3;

      if (requesterFaculty && normalizeText(candidate.faculty) === requesterFaculty) {
        score += 2;
      }

      if (requesterCompany && normalizeText(candidate.company) === requesterCompany) {
        score += 1;
      }

      const candidateYear = toYear(candidate.year);
      if (requesterYear !== null && candidateYear !== null && Math.abs(candidateYear - requesterYear) <= 2) {
        score += 1;
      }

      return {
        score,
        alumni: serializeAlumni(candidate),
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((entry) => entry.alumni);

  return {
    alumni: ranked,
    message: ranked.length > 0 ? 'Showing similar alumni from your profile details.' : 'No similar alumni found yet. Add more profile details to improve matching.',
    source: 'mongodb',
  };
}

export const POST: APIRoute = async ({ request }) => {
  let body: SimilarAlumniRequest;

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.alumni_id || typeof body.alumni_id !== 'string') {
    return new Response(JSON.stringify({ error: 'alumni_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const pythonResponse = await tryPythonApi(body);
    if (pythonResponse) {
      return new Response(JSON.stringify(pythonResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fallbackResponse = await buildMongoFallback(body.alumni_id);
    return new Response(JSON.stringify(fallbackResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Similar alumni fallback error:', error);
    return new Response(
      JSON.stringify({
        alumni: [],
        message: 'Unable to load similar alumni right now. Please try again later.',
        source: 'mongodb',
      } satisfies SimilarAlumniResponse),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
