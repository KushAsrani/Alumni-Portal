"""
events_schema.py — Initialize MongoDB collections and indexes for the Events module.

Usage:
    python events_schema.py

Safe to run multiple times (idempotent).
"""

import os
import sys
from pymongo import MongoClient, ASCENDING
from pymongo.errors import CollectionInvalid


def init_events_collections(db):
    """Create collections with JSON Schema validators and indexes."""

    # ------------------------------------------------------------------
    # events
    # ------------------------------------------------------------------
    events_validator = {
        '$jsonSchema': {
            'bsonType': 'object',
            'required': ['title', 'slug', 'hostEmail', 'eventType', 'startTime', 'endTime', 'capacity', 'status', 'createdAt'],
            'properties': {
                'title':     {'bsonType': 'string'},
                'slug':      {'bsonType': 'string'},
                'hostEmail': {'bsonType': 'string'},
                'eventType': {'enum': ['webinar', 'ama', 'workshop']},
                'startTime': {'bsonType': 'date'},
                'endTime':   {'bsonType': 'date'},
                'capacity':  {'bsonType': 'int'},
                'status':    {'enum': ['upcoming', 'live', 'ended', 'cancelled']},
                'createdAt': {'bsonType': 'date'},
            },
        }
    }
    _create_or_modify_collection(db, 'events', events_validator)

    events = db['events']
    events.create_index([('slug', ASCENDING)], unique=True)
    events.create_index([('status', ASCENDING)])
    events.create_index([('startTime', ASCENDING)])
    print('✅ events collection ready')

    # ------------------------------------------------------------------
    # event_rsvps
    # ------------------------------------------------------------------
    rsvps_validator = {
        '$jsonSchema': {
            'bsonType': 'object',
            'required': ['eventId', 'userEmail', 'rsvpStatus', 'createdAt'],
            'properties': {
                'eventId':    {'bsonType': 'objectId'},
                'userEmail':  {'bsonType': 'string'},
                'rsvpStatus': {'enum': ['confirmed', 'waitlisted', 'cancelled']},
                'createdAt':  {'bsonType': 'date'},
            },
        }
    }
    _create_or_modify_collection(db, 'event_rsvps', rsvps_validator)

    rsvps = db['event_rsvps']
    rsvps.create_index([('eventId', ASCENDING), ('userEmail', ASCENDING)], unique=True)
    rsvps.create_index([('eventId', ASCENDING), ('rsvpStatus', ASCENDING)])
    rsvps.create_index([('reminderSent', ASCENDING)])
    print('✅ event_rsvps collection ready')

    # ------------------------------------------------------------------
    # networking_rooms
    # ------------------------------------------------------------------
    rooms_validator = {
        '$jsonSchema': {
            'bsonType': 'object',
            'required': ['eventId', 'name', 'isActive', 'createdAt'],
            'properties': {
                'eventId':  {'bsonType': 'objectId'},
                'name':     {'bsonType': 'string'},
                'isActive': {'bsonType': 'bool'},
                'createdAt': {'bsonType': 'date'},
            },
        }
    }
    _create_or_modify_collection(db, 'networking_rooms', rooms_validator)

    rooms = db['networking_rooms']
    rooms.create_index([('eventId', ASCENDING), ('isActive', ASCENDING)])
    print('✅ networking_rooms collection ready')

    # ------------------------------------------------------------------
    # room_messages
    # ------------------------------------------------------------------
    messages_validator = {
        '$jsonSchema': {
            'bsonType': 'object',
            'required': ['roomId', 'userEmail', 'message', 'createdAt'],
            'properties': {
                'roomId':    {'bsonType': 'objectId'},
                'userEmail': {'bsonType': 'string'},
                'message':   {'bsonType': 'string'},
                'createdAt': {'bsonType': 'date'},
            },
        }
    }
    _create_or_modify_collection(db, 'room_messages', messages_validator)

    messages = db['room_messages']
    messages.create_index([('roomId', ASCENDING), ('createdAt', ASCENDING)])
    print('✅ room_messages collection ready')


def _create_or_modify_collection(db, name: str, validator: dict):
    """Create collection if it doesn't exist, or update its validator."""
    existing = db.list_collection_names()
    if name not in existing:
        try:
            db.create_collection(name, validator=validator)
        except CollectionInvalid:
            pass  # Already created by a concurrent call
    else:
        db.command('collMod', name, validator=validator)


if __name__ == '__main__':
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    uri = os.getenv('MONGODB_URI')
    if not uri:
        print('❌ MONGODB_URI environment variable is not set')
        sys.exit(1)

    client = MongoClient(uri)
    db = client['alumni_portal']
    init_events_collections(db)
    client.close()
    print('\n🎉 Events schema initialized successfully!')
