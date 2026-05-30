// Run with: node scripts/set-default-mentorship-fields.js
// Or in MongoDB shell: paste the updateMany commands

import { MongoClient } from 'mongodb';

async function main() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('Set MONGODB_URI env var first');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db('alumni_portal');
  const col = db.collection('alumni_registrations');

  const r1 = await col.updateMany(
    { open_to_mentorship: { $exists: false } },
    { $set: { open_to_mentorship: false } }
  );
  console.log(`Set open_to_mentorship=false on ${r1.modifiedCount} documents`);

  const r2 = await col.updateMany(
    { open_to_work: { $exists: false } },
    { $set: { open_to_work: false } }
  );
  console.log(`Set open_to_work=false on ${r2.modifiedCount} documents`);

  const r3 = await col.updateMany(
    { open_to_referral: { $exists: false } },
    { $set: { open_to_referral: false } }
  );
  console.log(`Set open_to_referral=false on ${r3.modifiedCount} documents`);

  await client.close();
  console.log('Done!');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
