import { connectToDatabase } from '../src/lib/mongodb.js';
import fs from 'fs';
import path from 'path';

async function importJobs() {
  console.log('📥 Importing jobs to MongoDB...\n');

  const { db } = await connectToDatabase();
  const collection = db.collection('actuarial_jobs');

  // Read the scraped jobs file
  const jobsFile = path.join(process.cwd(), 'data', 'actuarial-jobs-mongodb.json');
  const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));

  // Clear existing jobs (optional)
  // await collection.deleteMany({});

  // Insert new jobs
  const result = await collection.insertMany(jobs);

  console.log(`✅ Successfully imported ${result.insertedCount} jobs!`);
  
  // Create indexes
  await collection.createIndex({ title: 'text', description: 'text' });
  await collection.createIndex({ source: 1 });
  await collection.createIndex({ location: 1 });
  await collection.createIndex({ company: 1 });
  await collection.createIndex({ scrapedAt: -1 });

  console.log('✅ Indexes created!');
  process.exit(0);
}

importJobs().catch(console.error);