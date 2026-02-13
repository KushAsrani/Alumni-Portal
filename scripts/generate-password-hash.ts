import { createHash } from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'your-super-secret-session-key-change-this';

function hashPassword(password: string): string {
  return createHash('sha256')
    .update(password + SESSION_SECRET)
    .digest('hex');
}

// Get password from command line
const password = process.argv[2];

if (!password) {
  console.log('Usage: ts-node scripts/generate-password-hash.ts <password>');
  process.exit(1);
}

const hash = hashPassword(password);
console.log('\n=================================');
console.log('Password Hash Generated');
console.log('=================================');
console.log(`Password: ${password}`);
console.log(`Hash: ${hash}`);
console.log('\nAdd to .env file:');
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log('=================================\n');