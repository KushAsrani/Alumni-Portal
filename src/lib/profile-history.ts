import { connectToDatabase } from './mongodb';
import type { AlumniRegistration } from './mongodb';

export interface ProfileHistoryEntry {
  _id?: string;
  alumniId: string;
  alumniEmail: string;
  changedFields: string[];
  changedAt: Date;
  changedBy: 'alumni' | 'admin';
}

const SKIPPED_FIELDS = new Set(['updated_at', 'last_login']);

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = normalizeValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

export async function recordProfileUpdate(
  alumniId: string,
  alumniEmail: string,
  oldData: Partial<AlumniRegistration>,
  newData: Partial<AlumniRegistration>,
  changedBy: 'alumni' | 'admin'
): Promise<void> {
  try {
    const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    const changedFields = [...keys].filter((key) => {
      if (SKIPPED_FIELDS.has(key)) {
        return false;
      }

      return JSON.stringify(normalizeValue((oldData as Record<string, unknown>)[key])) !== JSON.stringify(normalizeValue((newData as Record<string, unknown>)[key]));
    });

    if (changedFields.length === 0) {
      return;
    }

    const { db } = await connectToDatabase();
    const collection = db.collection<Omit<ProfileHistoryEntry, '_id'>>('profile_update_history');

    await collection.insertOne({
      alumniId,
      alumniEmail,
      changedFields,
      changedAt: new Date(),
      changedBy,
    });
  } catch (error) {
    console.error('Record profile update error:', error);
  }
}

export async function getProfileHistory(alumniId: string, limit = 20): Promise<ProfileHistoryEntry[]> {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection<ProfileHistoryEntry>('profile_update_history');

    const entries = await collection
      .find({ alumniId })
      .sort({ changedAt: -1 })
      .limit(limit)
      .toArray();

    return entries.map((entry) => ({
      ...entry,
      _id: typeof entry._id === 'string' ? entry._id : entry._id?.toString(),
      changedAt: new Date(entry.changedAt),
    }));
  } catch (error) {
    console.error('Get profile history error:', error);
    return [];
  }
}
