/**
 * Migrate User.department from String to ObjectId(ref: Department).
 *
 * - Users whose department value is already a valid ObjectId → keep as-is
 *   (Mongoose will auto-cast when schema changes).
 * - Users whose department value is a department name → try to match by name,
 *   replace with the matched Department's _id or null.
 * - Users with empty/unset department → leave as null.
 *
 * Usage: node scripts/migrate-user-department.js
 */

const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/amserp';

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected: ${MONGO_URI}`);

  const db = mongoose.connection.db;
  const users = db.collection('users');
  const departments = db.collection('departments');

  // Fetch all departments as a name→id map
  const deptDocs = await departments.find({}).toArray();
  const nameToId = {};
  for (const d of deptDocs) {
    if (d.name) nameToId[d.name.toLowerCase().trim()] = d._id;
  }

  // Find users whose department field is a string (not null, not ObjectId)
  const pipeline = [
    { $match: { department: { $type: 'string', $ne: '' } } },
  ];
  const toMigrate = await users.aggregate(pipeline).toArray();
  console.log(`Found ${toMigrate.length} users with string-typed department values.`);

  let updated = 0;
  let skipped = 0;

  for (const user of toMigrate) {
    const raw = user.department;
    let newDept = null;

    // If the string looks like a 24-char hex ObjectId, try matching by _id
    if (/^[a-fA-F0-9]{24}$/.test(raw)) {
      const match = deptDocs.find((d) => d._id.toString() === raw);
      if (match) {
        newDept = match._id;
      } else {
        console.warn(`  User ${user._id}: value "${raw}" is valid ObjectId but no Department found → setting null`);
      }
    } else if (nameToId[raw.toLowerCase().trim()]) {
      // Match by name (legacy path)
      newDept = nameToId[raw.toLowerCase().trim()];
      console.log(`  User ${user._id}: matched by name "${raw}" → ${newDept}`);
    } else {
      console.warn(`  User ${user._id}: value "${raw}" is neither ObjectId nor known department name → setting null`);
    }

    if (newDept) {
      await users.updateOne({ _id: user._id }, { $set: { department: newDept } });
      updated++;
    } else {
      await users.updateOne({ _id: user._id }, { $set: { department: null } });
      skipped++;
    }
  }

  console.log(`\nDone: ${updated} updated to ObjectId, ${skipped} set to null.`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
