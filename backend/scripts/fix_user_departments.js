/**
 * Clean invalid User.department values that break Department populate.
 *
 * Usage:
 *   node scripts/fix_user_departments.js
 */

const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/amserp';

async function run() {
  await mongoose.connect(mongoUri);

  const users = mongoose.connection.db.collection('users');
  const badLiteralResult = await users.updateMany(
    { department: { $in: ['', 'null', 'undefined'] } },
    { $set: { department: null } },
  );

  const invalidStringUsers = await users
    .find({ department: { $type: 'string' } })
    .project({ department: 1 })
    .toArray();

  let invalidStringModified = 0;
  for (const user of invalidStringUsers) {
    if (!mongoose.Types.ObjectId.isValid(user.department)) {
      const result = await users.updateOne(
        { _id: user._id },
        { $set: { department: null } },
      );
      invalidStringModified += result.modifiedCount;
    }
  }

  const remainingInvalid = await users.countDocuments({
    department: { $in: ['', 'null', 'undefined'] },
  });

  console.log(JSON.stringify({
    success: true,
    matchedBadLiterals: badLiteralResult.matchedCount,
    modifiedBadLiterals: badLiteralResult.modifiedCount,
    scannedStringDepartments: invalidStringUsers.length,
    modifiedInvalidStrings: invalidStringModified,
    remainingBadLiterals: remainingInvalid,
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('Failed to clean user departments:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
