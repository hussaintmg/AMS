/**
 * Fix existing User documents with invalid department values.
 *
 * Schema expects department to be null or a valid ObjectId(ref: Department).
 * Some documents have department: "" (empty string) which crashes populate.
 *
 * This script sets department to null for:
 *   - department: ""
 *   - department: "null"
 *   - department: "undefined"
 *   - department: invalid ObjectId strings
 *
 * Usage: node scripts/fix_bad_department_data.js
 */

const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/amserp";

async function fix() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected: ${MONGO_URI}`);

  const db = mongoose.connection.db;
  const users = db.collection("users");

  const badValues = ["", "null", "undefined"];
  let totalFixed = 0;

  for (const val of badValues) {
    const result = await users.updateMany(
      { department: val },
      { $set: { department: null } }
    );
    if (result.modifiedCount > 0) {
      console.log(`Fixed ${result.modifiedCount} users with department: ${JSON.stringify(val)}`);
      totalFixed += result.modifiedCount;
    }
  }

  // Also catch any strings that are not valid ObjectId but got through
  const stringDepts = await users
    .find({ department: { $type: "string" } })
    .project({ department: 1 })
    .limit(100)
    .toArray();

  if (stringDepts.length > 0) {
    console.log(`\nFound ${stringDepts.length} additional users with string-typed department (checking validity)...`);
    let fixedFromInvalid = 0;
    for (const user of stringDepts) {
      const rawDept = user.department;
      const isObjectId = /^[a-fA-F0-9]{24}$/.test(rawDept);
      if (!isObjectId) {
        await users.updateOne({ _id: user._id }, { $set: { department: null } });
        fixedFromInvalid++;
        console.log(`  User ${user._id}: "${rawDept}" is not a valid ObjectId → set to null`);
      }
    }
    if (fixedFromInvalid > 0) {
      console.log(`Fixed ${fixedFromInvalid} additional invalid string departments`);
      totalFixed += fixedFromInvalid;
    }
  } else {
    console.log("No additional string-typed departments found.");
  }

  console.log(`\nTotal fixed: ${totalFixed}`);
  await mongoose.disconnect();
}

fix().catch((err) => {
  console.error("Fix failed:", err);
  process.exit(1);
});
