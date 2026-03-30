// scripts/setup-mongodb.js
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { MongoClient } from 'mongodb';

async function setupMongoDB() {
  console.log('🚀 Setting up MongoDB...\n');

  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('❌ MONGODB_URI not found in .env.local');
    console.log('\nPlease add MONGODB_URI to your .env.local file\n');
    process.exit(1);
  }
  
  console.log('✓ Using MongoDB connection string\n');

  const client = new MongoClient(uri);

  try {
    console.log('📝 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    const db = client.db('alumni_portal');
    const collection = db.collection('alumni_registrations');

    console.log('📝 Creating indexes...');
    
    // Create unique index on email
    await collection.createIndex({ email: 1 }, { unique: true });
    console.log('✅ Email index created\n');

    // Create index on status
    await collection.createIndex({ status: 1 });
    console.log('✅ Status index created\n');

    // Create index on created_at for sorting
    await collection.createIndex({ created_at: -1 });
    console.log('✅ Created_at index created\n');

    // Create indexes for filtering
    await collection.createIndex({ year: 1 });
    await collection.createIndex({ faculty: 1 });
    console.log('✅ Year and Faculty indexes created\n');

    console.log('🎉 MongoDB setup completed successfully!\n');
    
    await client.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up MongoDB:', error);
    console.error('\nError details:', error.message);
    try {
      await client.close();
    } catch (e) {
      // ignore
    }
    process.exit(1);
  }
}

setupMongoDB();