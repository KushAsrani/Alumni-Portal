# Environment Variables:
# - MONGODB_URI: MongoDB connection string
# - SMTP_HOST: SMTP server host (default: smtp.gmail.com)
# - SMTP_PORT: SMTP server port (default: 587)
# - SMTP_USER: SMTP username / sender email
# - SMTP_PASSWORD: SMTP password

import os
import smtplib
from flask import Blueprint, jsonify, request
from pymongo import MongoClient, ASCENDING
from bson import ObjectId
from bson.errors import InvalidId
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

events_bp = Blueprint('events', __name__)

# ---------------------------------------------------------------------------
# MongoDB connection
# ---------------------------------------------------------------------------

_client = None
_db = None


def get_db():
    global _client, _db
    if _db is not None:
        return _db
    uri = os.getenv('MONGODB_URI')
    if not uri:
        raise RuntimeError('MONGODB_URI environment variable is not set')
    _client = MongoClient(uri)
    _db = _client['alumni_portal']
    return _db


# ---------------------------------------------------------------------------
# Email helper
# ---------------------------------------------------------------------------

def send_email(to_address: str, subject: str, body_html: str) -> bool:
    """Send an HTML email via SMTP. Returns True on success."""
    smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
    smtp_port = int(os.getenv('SMTP_PORT', '587'))
    smtp_user = os.getenv('SMTP_USER', '')
    smtp_password = os.getenv('SMTP_PASSWORD', '')

    if not smtp_user or not smtp_password:
        print(f'[events_api] SMTP credentials not configured — skipping email to {to_address}')
        return False

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_user
        msg['To'] = to_address
        msg.attach(MIMEText(body_html, 'html'))

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, to_address, msg.as_string())

        return True
    except Exception as exc:
        print(f'[events_api] Failed to send email to {to_address}: {exc}')
        return False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@events_bp.route('/api/events/send-reminders', methods=['POST'])
def send_reminders():
    """
    Query events starting in 23-25 h and 50-70 min windows.
    For each, find confirmed RSVPs with reminderSent=False, send email, mark sent.
    """
    db = get_db()
    now = datetime.utcnow()

    windows = [
        (now + timedelta(hours=23), now + timedelta(hours=25)),
        (now + timedelta(minutes=50), now + timedelta(minutes=70)),
    ]

    total_sent = 0
    errors = []

    for window_start, window_end in windows:
        events = list(db['events'].find({
            'startTime': {'$gte': window_start, '$lte': window_end},
            'status': {'$in': ['upcoming', 'live']},
        }))

        for event in events:
            event_id = event['_id']
            rsvps = list(db['event_rsvps'].find({
                'eventId': event_id,
                'rsvpStatus': 'confirmed',
                'reminderSent': False,
            }))

            for rsvp in rsvps:
                user_email = rsvp.get('userEmail', '')
                user_name = rsvp.get('userName', 'Attendee')
                start_time = event.get('startTime', '')
                if hasattr(start_time, 'strftime'):
                    start_str = start_time.strftime('%B %d, %Y at %H:%M UTC')
                else:
                    start_str = str(start_time)

                meeting_url = event.get('meetingUrl', '')
                meeting_link_html = (
                    f'<p><a href="{meeting_url}">Join Meeting</a></p>'
                    if meeting_url else ''
                )

                subject = f"Reminder: {event['title']} is starting soon"
                body = f"""
                <html><body>
                <h2>Hi {user_name},</h2>
                <p>This is a reminder that <strong>{event['title']}</strong> starts on <strong>{start_str}</strong>.</p>
                {meeting_link_html}
                <p>See you there!</p>
                </body></html>
                """

                ok = send_email(user_email, subject, body)
                if ok:
                    db['event_rsvps'].update_one(
                        {'_id': rsvp['_id']},
                        {'$set': {'reminderSent': True}}
                    )
                    total_sent += 1
                else:
                    errors.append(f'Failed to send reminder to {user_email}')

    return jsonify({'success': True, 'remindersSent': total_sent, 'errors': errors}), 200


@events_bp.route('/api/events/promote-waitlist', methods=['POST'])
def promote_waitlist():
    """
    Promote the next waitlisted user for an event if capacity allows.
    Body: { event_id: string }
    """
    db = get_db()
    data = request.get_json(force=True) or {}
    event_id_str = data.get('event_id', '')

    try:
        event_id = ObjectId(event_id_str)
    except (InvalidId, Exception):
        return jsonify({'success': False, 'message': 'Invalid event_id'}), 400

    event = db['events'].find_one({'_id': event_id})
    if not event:
        return jsonify({'success': False, 'message': 'Event not found'}), 404

    capacity = event.get('capacity', 0)
    confirmed_count = db['event_rsvps'].count_documents({
        'eventId': event_id,
        'rsvpStatus': 'confirmed',
    })

    if confirmed_count >= capacity:
        return jsonify({'success': False, 'message': 'Event is at full capacity'}), 200

    # Find oldest waitlisted RSVP
    next_rsvp = db['event_rsvps'].find_one(
        {'eventId': event_id, 'rsvpStatus': 'waitlisted'},
        sort=[('createdAt', ASCENDING)]
    )

    if not next_rsvp:
        return jsonify({'success': False, 'message': 'No waitlisted users'}), 200

    db['event_rsvps'].update_one(
        {'_id': next_rsvp['_id']},
        {'$set': {'rsvpStatus': 'confirmed'}}
    )

    # Send notification email
    user_email = next_rsvp.get('userEmail', '')
    user_name = next_rsvp.get('userName', 'Attendee')
    start_time = event.get('startTime', '')
    if hasattr(start_time, 'strftime'):
        start_str = start_time.strftime('%B %d, %Y at %H:%M UTC')
    else:
        start_str = str(start_time)

    meeting_url = event.get('meetingUrl', '')
    meeting_link_html = (
        f'<p><a href="{meeting_url}">Join Meeting</a></p>'
        if meeting_url else ''
    )

    subject = f"You're in! RSVP confirmed for {event['title']}"
    body = f"""
    <html><body>
    <h2>Great news, {user_name}!</h2>
    <p>A spot has opened up and your RSVP for <strong>{event['title']}</strong> is now <strong>confirmed</strong>.</p>
    <p>The event starts on <strong>{start_str}</strong>.</p>
    {meeting_link_html}
    <p>See you there!</p>
    </body></html>
    """
    send_email(user_email, subject, body)

    return jsonify({
        'success': True,
        'promoted': True,
        'promotedEmail': user_email,
    }), 200
