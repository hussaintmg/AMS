/**
 * Cleanup user page permissions.
 *
 * - Unsets customPermissions (page permission overrides) on all users.
 * - Leaves logsPermissions and logPermissionSource untouched.
 * - Does NOT delete or modify users.
 *
 * Usage: node scripts/cleanup_user_page_permissions.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load env
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/amserp';

async function cleanup() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;

  // Unset customPermissions field on all users
  const result = await db.collection('users').updateMany(
    { customPermissions: { $exists: true } },
    { $unset: { customPermissions: '' } }
  );
  console.log(`Unset customPermissions on ${result.modifiedCount} users`);

  // Remove permissionSource if it exists (separate from logPermissionSource)
  const result2 = await db.collection('users').updateMany(
    { permissionSource: { $exists: true } },
    { $unset: { permissionSource: '' } }
  );
  if (result2.modifiedCount > 0) {
    console.log(`Unset permissionSource on ${result2.modifiedCount} users`);
  }

  console.log('Cleanup complete');
  await mongoose.disconnect();
}

cleanup().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
