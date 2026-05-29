export const prerender = false;

import type { APIRoute } from 'astro';
import { connectToDatabase } from '../../../lib/mongodb';
import { isAuthenticated } from '../../../lib/auth';

type EngagementType = 'profile_view' | 'connection_request' | 'mentorship_booking' | 'login' | 'profile_update';

function isAdminAuthorized(request: Request, cookies: any): boolean {
  if (isAuthenticated(cookies)) return true;

  const authHeader = request.headers.get('Authorization') || '';
  const apiKey = import.meta.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY || '';
  const expectedAuth = 'Bearer ' + apiKey;

  return Boolean(apiKey && authHeader === expectedAuth);
}

function getLastMonths(count: number) {
  const months: Array<{ key: string; month: string; start: Date; end: Date }> = [];
  const now = new Date();

  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const month = start.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    months.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      month,
      start,
      end,
    });
  }

  return months;
}

export const GET: APIRoute = async ({ request, cookies, url }) => {
  if (!isAdminAuthorized(request, cookies)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_engagement');
    const feedOnly = url.searchParams.get('feed') === 'true';

    if (feedOnly) {
      const feed = await collection
        .find({})
        .sort({ createdAt: -1 })
        .limit(20)
        .project({
          type: 1,
          alumniId: 1,
          targetAlumniId: 1,
          alumniName: 1,
          targetAlumniName: 1,
          status: 1,
          createdAt: 1,
          metadata: 1,
        })
        .toArray();

      return new Response(
        JSON.stringify({
          feed,
          generatedAt: new Date().toISOString(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const now = Date.now();
    const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const months = getLastMonths(6);
    const monthsStart = months[0]?.start || new Date(now - 180 * 24 * 60 * 60 * 1000);
    const monthsEnd = months[months.length - 1]?.end || new Date();

    const [
      totalProfileViews,
      profileViewsLast7Days,
      profileViewsLast30Days,
      topViewedProfiles,
      totalConnectionRequests,
      connectionRequestsPending,
      connectionRequestsAccepted,
      connectionRequestsLast30Days,
      totalMentorshipBookings,
      mentorshipCompleted,
      mentorshipPending,
      mentorshipCancelled,
      mentorshipLast30Days,
      topMentors,
      totalLogins,
      loginsLast7Days,
      loginsLast30Days,
      activeAlumniLast30DaysDistinct,
      totalProfileUpdates,
      profileUpdatesLast30Days,
      engagementByMonthRaw,
    ] = await Promise.all([
      collection.countDocuments({ type: 'profile_view' }),
      collection.countDocuments({ type: 'profile_view', createdAt: { $gte: last7Days } }),
      collection.countDocuments({ type: 'profile_view', createdAt: { $gte: last30Days } }),
      collection
        .aggregate([
          { $match: { type: 'profile_view' } },
          {
            $group: {
              _id: {
                alumniId: '$targetAlumniId',
                alumniName: '$targetAlumniName',
              },
              views: { $sum: 1 },
            },
          },
          { $sort: { views: -1 } },
          { $limit: 10 },
          {
            $project: {
              _id: 0,
              alumniName: { $ifNull: ['$_id.alumniName', 'Unknown Alumni'] },
              alumniId: { $ifNull: ['$_id.alumniId', 'unknown'] },
              views: 1,
            },
          },
        ])
        .toArray(),

      collection.countDocuments({ type: 'connection_request' }),
      collection.countDocuments({ type: 'connection_request', status: 'pending' }),
      collection.countDocuments({ type: 'connection_request', status: 'accepted' }),
      collection.countDocuments({ type: 'connection_request', createdAt: { $gte: last30Days } }),

      collection.countDocuments({ type: 'mentorship_booking' }),
      collection.countDocuments({ type: 'mentorship_booking', status: 'completed' }),
      collection.countDocuments({ type: 'mentorship_booking', status: 'pending' }),
      collection.countDocuments({ type: 'mentorship_booking', status: 'cancelled' }),
      collection.countDocuments({ type: 'mentorship_booking', createdAt: { $gte: last30Days } }),
      collection
        .aggregate([
          { $match: { type: 'mentorship_booking' } },
          {
            $group: {
              _id: {
                alumniId: '$targetAlumniId',
                alumniName: '$targetAlumniName',
              },
              sessionCount: { $sum: 1 },
            },
          },
          { $sort: { sessionCount: -1 } },
          { $limit: 5 },
          {
            $project: {
              _id: 0,
              alumniName: { $ifNull: ['$_id.alumniName', 'Unknown Mentor'] },
              alumniId: { $ifNull: ['$_id.alumniId', 'unknown'] },
              sessionCount: 1,
            },
          },
        ])
        .toArray(),

      collection.countDocuments({ type: 'login' }),
      collection.countDocuments({ type: 'login', createdAt: { $gte: last7Days } }),
      collection.countDocuments({ type: 'login', createdAt: { $gte: last30Days } }),
      collection.distinct('alumniId', { type: 'login', createdAt: { $gte: last30Days } }),

      collection.countDocuments({ type: 'profile_update' }),
      collection.countDocuments({ type: 'profile_update', createdAt: { $gte: last30Days } }),

      collection
        .aggregate([
          {
            $match: {
              createdAt: { $gte: monthsStart, $lt: monthsEnd },
              type: { $in: ['profile_view', 'connection_request', 'mentorship_booking'] as EngagementType[] },
            },
          },
          {
            $group: {
              _id: {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
                type: '$type',
              },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray(),
    ]);

    const monthlyMap = new Map<string, { profileViews: number; connections: number; mentorships: number }>();
    months.forEach((m) => monthlyMap.set(m.key, { profileViews: 0, connections: 0, mentorships: 0 }));

    for (const row of engagementByMonthRaw) {
      const key = `${row._id.year}-${String(row._id.month).padStart(2, '0')}`;
      const bucket = monthlyMap.get(key);
      if (!bucket) continue;

      if (row._id.type === 'profile_view') bucket.profileViews = row.count;
      if (row._id.type === 'connection_request') bucket.connections = row.count;
      if (row._id.type === 'mentorship_booking') bucket.mentorships = row.count;
    }

    const engagementByMonth = months.map((monthMeta) => ({
      month: monthMeta.month,
      ...(monthlyMap.get(monthMeta.key) || { profileViews: 0, connections: 0, mentorships: 0 }),
    }));

    return new Response(
      JSON.stringify({
        totalProfileViews,
        profileViewsLast7Days,
        profileViewsLast30Days,
        topViewedProfiles,

        totalConnectionRequests,
        connectionRequestsPending,
        connectionRequestsAccepted,
        connectionRequestsLast30Days,

        totalMentorshipBookings,
        mentorshipCompleted,
        mentorshipPending,
        mentorshipCancelled,
        mentorshipLast30Days,
        topMentors,

        totalLogins,
        loginsLast7Days,
        loginsLast30Days,
        activeAlumniLast30Days: activeAlumniLast30DaysDistinct.length,

        totalProfileUpdates,
        profileUpdatesLast30Days,

        engagementByMonth,
        generatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching engagement stats:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
