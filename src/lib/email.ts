import nodemailer from 'nodemailer';

function getTransporter() {
  const port = parseInt(process.env.SMTP_PORT || import.meta.env.SMTP_PORT || '587');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || import.meta.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER || import.meta.env.SMTP_USER,
      pass: process.env.SMTP_PASS || import.meta.env.SMTP_PASS,
    },
  });
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  const from = process.env.SMTP_FROM || import.meta.env.SMTP_FROM || 'Alumni Portal <noreply@example.com>';
  const transporter = getTransporter();
  await transporter.sendMail({ from, ...opts });
}

export function buildReminderEmail(params: {
  userName: string;
  eventTitle: string;
  eventType: string;
  startTime: Date;
  endTime: Date;
  venue?: string;
  location?: string;
  eventUrl: string;
  hoursUntil: number; // 24 or 1
}): { subject: string; html: string; text: string } {
  const { userName, eventTitle, eventType, startTime, endTime, venue, location, eventUrl, hoursUntil } = params;
  const dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = `${startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} – ${endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  const locationStr = venue ? `${venue}${location ? ', ' + location : ''}` : (eventType === 'webinar' ? 'Online / Remote' : 'TBD');
  const label = hoursUntil === 1 ? 'starts in 1 hour' : 'is tomorrow';

  const subject = `Reminder: "${eventTitle}" ${label}`;

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 0;">
      <div style="background: #2e4096; padding: 32px 40px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">📅 Event Reminder</h1>
      </div>
      <div style="background: white; padding: 32px 40px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #334155; font-size: 16px;">Hi <strong>${userName}</strong>,</p>
        <p style="color: #334155; font-size: 16px;">This is a reminder that <strong>${eventTitle}</strong> ${label}.</p>
        <div style="background: #eef2ff; border-left: 4px solid #2e4096; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0 0 8px; color: #1d275c;"><strong>📌 Event:</strong> ${eventTitle}</p>
          <p style="margin: 0 0 8px; color: #1d275c;"><strong>📆 Date:</strong> ${dateStr}</p>
          <p style="margin: 0 0 8px; color: #1d275c;"><strong>🕐 Time:</strong> ${timeStr}</p>
          <p style="margin: 0; color: #1d275c;"><strong>📍 Location:</strong> ${locationStr}</p>
        </div>
        <a href="${eventUrl}" style="display: inline-block; background: #2e4096; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-top: 8px;">
          View Event &amp; Join Link →
        </a>
        <p style="color: #94a3b8; font-size: 13px; margin-top: 32px;">You received this reminder because you registered for this event on the Alumni Portal. If you no longer wish to attend, you can cancel your registration on the event page.</p>
      </div>
    </div>
  `;

  const text = `Reminder: "${eventTitle}" ${label}.\n\nDate: ${dateStr}\nTime: ${timeStr}\nLocation: ${locationStr}\n\nView event: ${eventUrl}`;

  return { subject, html, text };
}

export function buildNotifyMeEmail(params: {
  userName: string;
  eventTitle: string;
  eventUrl: string;
  joinLinkUrl: string;
}): { subject: string; html: string; text: string } {
  const { userName, eventTitle, eventUrl, joinLinkUrl } = params;

  const subject = `Join link is now live: "${eventTitle}"`;
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 0;">
      <div style="background: #2e4096; padding: 32px 40px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">🔴 Join Link is Live!</h1>
      </div>
      <div style="background: white; padding: 32px 40px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #334155; font-size: 16px;">Hi <strong>${userName}</strong>,</p>
        <p style="color: #334155; font-size: 16px;">The join link for <strong>${eventTitle}</strong> has just been activated by the host. You can now join the event.</p>
        <a href="${joinLinkUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-top: 8px;">
          Join Now →
        </a>
        <p style="margin-top: 16px;"><a href="${eventUrl}" style="color: #2e4096;">View event details</a></p>
        <p style="color: #94a3b8; font-size: 13px; margin-top: 32px;">You received this notification because you subscribed to join link notifications for this event on the Alumni Portal.</p>
      </div>
    </div>
  `;
  const text = `The join link for "${eventTitle}" is now live!\n\nJoin now: ${joinLinkUrl}\n\nEvent details: ${eventUrl}`;
  return { subject, html, text };
}
