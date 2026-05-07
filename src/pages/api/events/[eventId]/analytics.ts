export const prerender = false;

import type { APIRoute } from 'astro';
import { EventService } from '../../../../lib/db/services/eventService';

export const GET: APIRoute = async ({ request, params }) => {
  try {
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${import.meta.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY}`;
    if (!authHeader || authHeader !== expectedAuth) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { eventId } = params;
    if (!eventId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rsvps = await EventService.getRsvps(eventId);

    const confirmedRsvps = rsvps.filter((rsvp) => rsvp.rsvpStatus === 'confirmed');
    const nonCancelledRsvps = rsvps.filter((rsvp) => rsvp.rsvpStatus !== 'cancelled');

    const confirmedCount = confirmedRsvps.length;
    const waitlistCount = rsvps.filter((rsvp) => rsvp.rsvpStatus === 'waitlisted').length;
    const checkedInCount = confirmedRsvps.filter((rsvp) => rsvp.checkedIn).length;
    const attendanceRate = confirmedCount > 0
      ? Math.round((checkedInCount / confirmedCount) * 1000) / 10
      : 0;

    const totalGuestCount = nonCancelledRsvps.reduce((sum, rsvp) => sum + (rsvp.guestCount || 0), 0);

    const facultyBreakdown: Record<string, number> = {};
    const activityBreakdown: Record<string, number> = {};
    const graduationYearBreakdown: Record<string, number> = {};
    const timelineMap: Record<string, number> = {};

    nonCancelledRsvps.forEach((rsvp) => {
      if (rsvp.faculty) {
        facultyBreakdown[rsvp.faculty] = (facultyBreakdown[rsvp.faculty] || 0) + 1;
      }

      if (typeof rsvp.graduationYear === 'number') {
        const year = String(rsvp.graduationYear);
        graduationYearBreakdown[year] = (graduationYearBreakdown[year] || 0) + 1;
      }

      if (Array.isArray(rsvp.activities)) {
        rsvp.activities.forEach((activity) => {
          if (!activity) return;
          activityBreakdown[activity] = (activityBreakdown[activity] || 0) + 1;
        });
      }
    });

    confirmedRsvps.forEach((rsvp) => {
      const dateKey = new Date(rsvp.createdAt).toISOString().split('T')[0];
      timelineMap[dateKey] = (timelineMap[dateKey] || 0) + 1;
    });

    const rsvpTimeline = Object.entries(timelineMap)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, count]) => ({ date, count }));

    return new Response(
      JSON.stringify({
        success: true,
        analytics: {
          confirmedCount,
          waitlistCount,
          checkedInCount,
          attendanceRate,
          totalGuestCount,
          facultyBreakdown,
          activityBreakdown,
          graduationYearBreakdown,
          rsvpTimeline,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching event analytics:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
