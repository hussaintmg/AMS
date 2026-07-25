/**
 * The forgot-password email is sent with a `user` context (staff or customer's
 * login user), but its template greeted {{customer.fullName}} which never
 * resolves for that flow. Point it at {{user.fullName}} instead.
 * Idempotent: safe to run repeatedly.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { EmailUsage, EmailTemplate } = require('../models');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/amserp', { serverSelectionTimeoutMS: 5000 });
  const usage = await EmailUsage.findOne({ key: 'forgot_password', isDeleted: false }).lean();
  if (!usage?.template) { console.log('no forgot_password usage/template'); process.exit(0); }
  const t = await EmailTemplate.findById(usage.template);
  if (!t) { console.log('template not found'); process.exit(0); }
  const swap = (s) => String(s || '').replace(/\{\{\s*customer\.fullName\s*\}\}/g, '{{user.fullName}}');
  let changed = 0;
  ['subject', 'html', 'plainText'].forEach((f) => {
    const next = swap(t[f]);
    if (next !== t[f]) { t[f] = next; changed++; }
  });
  if (changed) { await t.save(); console.log(`updated forgot_password template (${changed} fields)`); }
  else console.log('forgot_password template already correct');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
