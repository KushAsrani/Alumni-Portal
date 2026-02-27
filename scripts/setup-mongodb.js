import { connectToDatabase } from '../src/lib/db/mongodb.ts';
import { MongoClient } from 'mongodb';

async function setupDatabase() {
  console.log('🗄️  Setting up MongoDB Atlas database...\n');
  const uri = process.env.MONGODB_URI;

    if (!uri) {
    console.error('❌ MONGODB_URI not found in .env.local');
    console.log('\nPlease add MONGODB_URI to your .env.local file\n');
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    const { db } = await connectToDatabase();

    // Create indexes for jobs collection
    console.log('Creating indexes for jobs collection...');
    const jobsCollection = db.collection('jobs');

    await jobsCollection.createIndex({ jobId: 1 }, { unique: true });
    await jobsCollection.createIndex({ status: 1 });
    await jobsCollection.createIndex({ source: 1 });
    await jobsCollection.createIndex({ location: 1 });
    await jobsCollection.createIndex({ experienceLevel: 1 });
    await jobsCollection.createIndex({ postedDate: -1 });
    await jobsCollection.createIndex({ featured: 1 });
    await jobsCollection.createIndex({ 'salary.min': 1 });
    
    // Text index for search
    await jobsCollection.createIndex({
      title: 'text',
      company: 'text',
      description: 'text',
      skills: 'text',
    });

    console.log('✅ Jobs collection indexes created');

    // Create indexes for scrape_logs collection
    console.log('Creating indexes for scrape_logs collection...');
    const logsCollection = db.collection('scrape_logs');

    await logsCollection.createIndex({ startedAt: -1 });
    await logsCollection.createIndex({ status: 1 });
    await logsCollection.createIndex({ source: 1 });

    console.log('✅ Scrape logs collection indexes created');

    console.log('\n✅ Database setup completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase();