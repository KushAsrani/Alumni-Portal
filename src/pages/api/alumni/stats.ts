export const prerender = false;

import type { APIRoute } from 'astro';
import { connectToDatabase } from '../../../lib/mongodb';

const APPROVED_FILTER = { status: 'approved' };

export const GET: APIRoute = async () => {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalAlumni,
      faculties,
      graduationYears,
      mentorshipAvailable,
      openToWork,
      openToReferral,
      topSkills,
      industryDistribution,
      facultyDistribution,
      locationDistribution,
      yearDistribution,
      recentlyJoined,
      profilesWithPhoto,
      profilesWithLinkedIn,
    ] = await Promise.all([
      collection.countDocuments(APPROVED_FILTER),
      collection.distinct('faculty', {
        ...APPROVED_FILTER,
        faculty: { $type: 'string', $ne: '' },
      }),
      collection
        .aggregate([
          { $match: APPROVED_FILTER },
          {
            $project: {
              normalizedYear: {
                $convert: { input: '$year', to: 'int', onError: null, onNull: null },
              },
            },
          },
          { $match: { normalizedYear: { $ne: null } } },
          { $group: { _id: '$normalizedYear' } },
        ])
        .toArray(),
      collection.countDocuments({ ...APPROVED_FILTER, open_to_mentorship: true }),
      collection.countDocuments({ ...APPROVED_FILTER, open_to_work: true }),
      collection.countDocuments({ ...APPROVED_FILTER, open_to_referral: true }),
      collection
        .aggregate([
          { $match: APPROVED_FILTER },
          {
            $project: {
              normalizedSkills: {
                $cond: [
                  { $isArray: '$skills' },
                  '$skills',
                  {
                    $cond: [
                      { $and: [{ $ne: ['$skills', null] }, { $ne: ['$skills', ''] }] },
                      {
                        $map: {
                          input: { $split: ['$skills', ','] },
                          as: 'skill',
                          in: { $trim: { input: '$$skill' } },
                        },
                      },
                      [],
                    ],
                  },
                ],
              },
            },
          },
          { $unwind: '$normalizedSkills' },
          { $match: { normalizedSkills: { $ne: '' } } },
          { $group: { _id: '$normalizedSkills', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 20 },
          { $project: { _id: 0, skill: '$_id', count: 1 } },
        ])
        .toArray(),
      collection
        .aggregate([
          { $match: { ...APPROVED_FILTER, company: { $type: 'string', $ne: '' } } },
          { $group: { _id: '$company', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 15 },
          { $project: { _id: 0, company: '$_id', count: 1 } },
        ])
        .toArray(),
      collection
        .aggregate([
          { $match: { ...APPROVED_FILTER, faculty: { $type: 'string', $ne: '' } } },
          { $group: { _id: '$faculty', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $project: { _id: 0, faculty: '$_id', count: 1 } },
        ])
        .toArray(),
      collection
        .aggregate([
          { $match: { ...APPROVED_FILTER, location: { $type: 'string', $ne: '' } } },
          { $group: { _id: '$location', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 15 },
          { $project: { _id: 0, location: '$_id', count: 1 } },
        ])
        .toArray(),
      collection
        .aggregate([
          { $match: APPROVED_FILTER },
          {
            $project: {
              normalizedYear: {
                $convert: { input: '$year', to: 'int', onError: null, onNull: null },
              },
            },
          },
          { $match: { normalizedYear: { $ne: null } } },
          { $group: { _id: '$normalizedYear', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, year: '$_id', count: 1 } },
        ])
        .toArray(),
      collection.countDocuments({ ...APPROVED_FILTER, created_at: { $gte: thirtyDaysAgo } }),
      collection.countDocuments({
        ...APPROVED_FILTER,
        $expr: {
          $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$photo_blob_url', ''] } } } }, 0],
        },
      }),
      collection.countDocuments({
        ...APPROVED_FILTER,
        $expr: {
          $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$linkedin', ''] } } } }, 0],
        },
      }),
    ]);

    return new Response(
      JSON.stringify({
        totalAlumni,
        totalFaculties: faculties.length,
        totalGraduationYears: graduationYears.length,
        mentorshipAvailable,
        openToWork,
        openToReferral,
        topSkills,
        industryDistribution,
        facultyDistribution,
        locationDistribution,
        yearDistribution,
        recentlyJoined,
        profilesWithPhoto,
        profilesWithLinkedIn,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Alumni stats error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to fetch alumni analytics stats',
        error: error?.message || 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
