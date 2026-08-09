/** Browser smoke check for the role-controlled Parts Barcode Scan screen. */
const path = require('path');
const mongoose = require('mongoose');
const puppeteer = require('puppeteer');

require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const APP = process.env.TEST_FRONTEND_BASE || 'http://localhost:3000';
const EMAIL = 'permission.tester@amserp.local';
const PASSWORD = 'PermTest#2026';

async function grantPartsScanCreate() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
  const { Role } = require('../models');
  const role = await Role.findOne({ name: 'permission_test_role' });
  if (!role) throw new Error('Run test_role_permissions.js first to create the browser-test role.');

  const existing = role.jobs.find((job) => job.pageKey === 'part_scan');
  if (existing) existing.actions.create = true;
  else role.jobs.push({
    pageKey: 'part_scan', module: 'Parts Sales', actions: { view: true, create: true },
    dataScope: { mode: 'all', roles: [], users: [] }, fields: { mode: 'all', allowed: [] },
  });
  await role.save();
  await mongoose.disconnect();
}

async function run() {
  await grantPartsScanCreate();
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${APP}/login`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.type('input[type="email"]', EMAIL);
    await page.type('input[type="password"]', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]'),
    ]);
    await page.goto(`${APP}/parts-sales/barcode-scan`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.scan-page', { timeout: 15000 });
    const result = await page.evaluate(() => ({
      text: document.body.innerText,
      url: window.location.href,
    }));
    const assertions = {
      openedPartsScanner: result.url.includes('/parts-sales/barcode-scan'),
      quotationOption: result.text.includes('Quotation'),
      invoiceOption: result.text.includes('Invoice (Counter Sale)'),
      noCreateDenial: !result.text.includes('may not create anything from it'),
    };
    console.log(JSON.stringify(assertions, null, 2));
    if (Object.values(assertions).some((ok) => !ok)) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
