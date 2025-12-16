import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import pg from 'pg';
const { Client } = pg;

async function setupDatabase() {
  console.log('🚀 Setting up database...\n');

  // Try different possible connection string variables
  const connectionString = 
    process.env.POSTGRES_URL_NON_POOLING || 
    process.env.POSTGRES_PRISMA_URL || 
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ Database connection string not found in .env.local');
    console.log('\nPlease run: vercel env pull .env.local\n');
    process.exit(1);
  }
  
  console.log('✓ Using connection string\n');

  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('📝 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    console.log('📝 Creating alumni_registrations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS alumni_registrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        year INTEGER,
        faculty VARCHAR(255),
        degree VARCHAR(255),
        linkedin VARCHAR(500),
        photo VARCHAR(500),
        short_bio TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table created successfully\n');

    console.log('📝 Creating email index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alumni_email 
      ON alumni_registrations(email)
    `);
    console.log('✅ Email index created\n');

    console.log('📝 Creating status index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alumni_status 
      ON alumni_registrations(status)
    `);
    console.log('✅ Status index created\n');

    console.log('📝 Creating trigger function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    console.log('✅ Trigger function created\n');

    await client.query(`
      DROP TRIGGER IF EXISTS update_alumni_updated_at 
      ON alumni_registrations
    `);

    console.log('📝 Creating trigger...');
    await client.query(`
      CREATE TRIGGER update_alumni_updated_at 
        BEFORE UPDATE ON alumni_registrations
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `);
    console.log('✅ Trigger created\n');

    console.log('🎉 Database setup completed successfully!\n');
    
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    console.error('\nError details:', error.message);
    try {
      await client.end();
    } catch (e) {
      // ignore
    }
    process.exit(1);
  }
}

setupDatabase();