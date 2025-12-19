import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import pg from 'pg';
const { Client } = pg;

async function addNewFields() {
  console.log('🚀 Adding new fields to database...\n');

  const connectionString = 
    process.env.POSTGRES_URL_NON_POOLING || 
    process.env.POSTGRES_PRISMA_URL || 
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ Database connection string not found');
    process.exit(1);
  }

  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    console.log('📝 Adding new columns...');
    
    // Add new columns
    await client.query(`
      ALTER TABLE alumni_registrations
      ADD COLUMN IF NOT EXISTS mobile VARCHAR(20),
      ADD COLUMN IF NOT EXISTS dob DATE,
      ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
      ADD COLUMN IF NOT EXISTS address TEXT,
      ADD COLUMN IF NOT EXISTS university VARCHAR(255),
      ADD COLUMN IF NOT EXISTS job_designation VARCHAR(255),
      ADD COLUMN IF NOT EXISTS company VARCHAR(255),
      ADD COLUMN IF NOT EXISTS photo_blob_url VARCHAR(500)
    `);
    
    console.log('✅ New columns added successfully\n');
    
    // Verify columns were added
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'alumni_registrations'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Current table structure:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    await client.end();
    console.log('\n🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during migration:', error);
    await client.end();
    process.exit(1);
  }
}

addNewFields();