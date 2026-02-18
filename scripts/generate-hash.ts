import { createHash } from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-key-in-production';

function hashPassword(password: string): string {
  return createHash('sha256')
    .update(password + SESSION_SECRET)
    .digest('hex');
}

// Get password from command line argument
const password = process.argv[2];

if (!password) {
  console.log('\n❌ Error: Password required');
  console.log('\nUsage:');
  console.log('  npm run generate-hash <password>');
  console.log('\nExample:');
  console.log('  npm run generate-hash MySecurePassword123');
  process.exit(1);
}

const hash = hashPassword(password);

console.log('\n' + '='.repeat(60));
console.log('🔐 PASSWORD HASH GENERATED');
console.log('='.repeat(60));
console.log(`\nPassword: ${password}`);
console.log(`Hash:     ${hash}`);
console.log('\n📝 Add to your .env file:');
console.log(`\nADMIN_PASSWORD_HASH=${hash}`);
console.log('\n' + '='.repeat(60) + '\n');