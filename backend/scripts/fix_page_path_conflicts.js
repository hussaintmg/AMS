/**
 * One-off repair for production `pages` collections that predate this seed
 * file's `name` keys. The seed script upserts by `name`, but `path` carries a
 * unique index — a row created under an older name (or moved from an old
 * path to a new one) collides and aborts the seed with E11000.
 *
 * This aligns every such row to the seed's own (name, path) pairing:
 *   - if a row already sits at the seed's target path under the wrong name,
 *     rename it (so the seed's upsert finds and updates it in place);
 *   - if a row under the correct name already exists elsewhere, the path
 *     row is stale (superseded) and is removed instead.
 *
 * Safe to run more than once — a clean database makes no changes.
 *
 *   node scripts/fix_page_path_conflicts.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: false });

const fs = require('fs');
const mongoose = require('mongoose');

const src = fs.readFileSync(path.join(__dirname, 'seed_pages_and_permissions.js'), 'utf8');
const entries = [...src.matchAll(/\['([a-z0-9_]+)','([^']*)','([^']*)','([^']*)','([^']*)','([^']*)'(?:,true)?\]/g)]
  .map((m) => ({ name: m[1], path: m[3] }));

(async () => {
  await mongoose.connect(
    process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/amserp',
    { dbName: process.env.MONGO_DB_NAME || undefined, serverSelectionTimeoutMS: 8000 },
  );
  const Pages = mongoose.connection.collection('pages');
  let fixed = 0;
  for (const { name, path: targetPath } of entries) {
    const atPath = await Pages.findOne({ path: targetPath });
    if (!atPath || atPath.name === name) continue;
    const atName = await Pages.findOne({ name });
    if (atName && String(atName._id) !== String(atPath._id)) {
      await Pages.deleteOne({ _id: atPath._id });
      console.log(`deleted stale "${atPath.name}" at ${targetPath} (kept "${name}" at ${atName.path})`);
    } else {
      await Pages.updateOne({ _id: atPath._id }, { $set: { name } });
      console.log(`renamed "${atPath.name}" -> "${name}" (${targetPath})`);
    }
    fixed += 1;
  }
  console.log(`\n${fixed} conflict(s) fixed out of ${entries.length} seed entries.`);
  await mongoose.disconnect();
})().catch((error) => { console.error(error.message); process.exit(1); });
