'''
python -c "
>> import os; from dotenv import load_dotenv; load_dotenv('../.env')
>> from pymongo import MongoClient
>> from db.events_schema import init_events_collections
>> client = MongoClient(os.getenv('MONGODB_URI'))
>> init_events_collections(client['alumni_portal'])
>> "
'''

import os
from dotenv import load_dotenv; load_dotenv('../.env')
from pymongo import MongoClient
from db.events_schema import init_events_collections
client = MongoClient(os.getenv('MONGODB_URI'))
init_events_collections(client['alumni_portal'])