import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import pg from 'pg';
const { Client } = pg;

async function addProfessionalFields() {
  console.log('🚀 Adding professional and education fields to database...\n');

  const connectionString = 
    process.env.POSTGRES_URL_NON_POOLING || 
    process.env.POSTGRES_PRISMA_URL || 
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ Database connection string not found');
    console.log('\nPlease run: vercel env pull .env.local\n');
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
      ADD COLUMN IF NOT EXISTS gpa VARCHAR(20),
      ADD COLUMN IF NOT EXISTS location VARCHAR(255),
      ADD COLUMN IF NOT EXISTS github VARCHAR(500),
      ADD COLUMN IF NOT EXISTS twitter VARCHAR(500),
      ADD COLUMN IF NOT EXISTS skills TEXT,
      ADD COLUMN IF NOT EXISTS projects TEXT,
      ADD COLUMN IF NOT EXISTS work_experience TEXT,
      ADD COLUMN IF NOT EXISTS interests TEXT
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
    console.log('═'.repeat(50));
    result.rows.forEach(row => {
      console.log(`  ${row.column_name.padEnd(30)} (${row.data_type})`);
    });
    console.log('═'.repeat(50));

    await client.end();
    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📝 New fields added:');
    console.log('  ✓ gpa (VARCHAR 20)');
    console.log('  ✓ location (VARCHAR 255)');
    console.log('  ✓ github (VARCHAR 500)');
    console.log('  ✓ twitter (VARCHAR 500)');
    console.log('  ✓ skills (TEXT)');
    console.log('  ✓ projects (TEXT)');
    console.log('  ✓ work_experience (TEXT)');
    console.log('  ✓ interests (TEXT)');
    console.log('\n✨ Ready to use! Restart your dev server.\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during migration:', error);
    console.error('\nError details:', error.message);
    try {
      await client.end();
    } catch (e) {
      // ignore
    }
    process.exit(1);
  }
}

addProfessionalFields();