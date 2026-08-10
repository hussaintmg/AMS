/**
 * Browser smoke check for the role-controlled Parts Barcode Scan screen, and
 * for the Role Jobs screen an operator is sent to when it denies them.
 *
 * The two halves belong together: the scanner tells an operator to have
 * "Create" ticked on Parts Scan, and that instruction is only true if the
 * administrator can find the card to tick it on.
 */
const path = require('path');
const mongoose = require('mongoose');
const puppeteer = require('puppeteer');

require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const APP = process.env.TEST_FRONTEND_BASE || 'http://localhost:3000';
const EMAIL = 'permission.tester@amserp.local';
const PASSWORD = 'PermTest#2026';
/** Holds no pages at all, so Role Jobs has to reveal one for it. */
const SEARCH_ROLE = 'role_jobs_search_test_role';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withDb(work) {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
  try { return await work(require('../models')); }
  finally { await mongoose.disconnect(); }
}

async function grantPartsScanCreate() {
  await withDb(async ({ Role }) => {
    const role = await Role.findOne({ name: 'permission_test_role' });
    if (!role) throw new Error('Run test_role_permissions.js first to create the browser-test role.');

    const existing = role.jobs.find((job) => job.pageKey === 'part_scan');
    if (existing) existing.actions.create = true;
    else role.jobs.push({
      pageKey: 'part_scan', module: 'Parts Sales', actions: { view: true, create: true },
      dataScope: { mode: 'all', roles: [], users: [] }, fields: { mode: 'all', allowed: [] },
    });
    await role.save();
  });
}

const createSearchRole = () => withDb(async ({ Role }) => {
  await Role.deleteOne({ name: SEARCH_ROLE });
  await Role.create({ name: SEARCH_ROLE, displayName: 'Role Jobs Search Test', permissions: [], jobs: [] });
});

const dropSearchRole = () => withDb(({ Role }) => Role.deleteOne({ name: SEARCH_ROLE }));

async function signIn(browser, email, password) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1500, height: 1100 });
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  return page;
}

/** The operator's half: the scanner offers what the role may raise. */
async function checkScanner(browser) {
  const page = await signIn(browser, EMAIL, PASSWORD);
  await page.goto(`${APP}/parts-sales/barcode-scan`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.scan-page', { timeout: 15000 });
  const result = await page.evaluate(() => ({ text: document.body.innerText, url: window.location.href }));
  return {
    openedPartsScanner: result.url.includes('/parts-sales/barcode-scan'),
    quotationOption: result.text.includes('Quotation'),
    invoiceOption: result.text.includes('Invoice (Counter Sale)'),
    noCreateDenial: !result.text.includes('may not create anything from it'),
  };
}

/**
 * The administrator's half: a page the role does not hold is still findable.
 *
 * Role Jobs hides pages the role cannot open, which used to apply to the search
 * as well — so searching "scan", exactly as the scanner's own message and the
 * search placeholder tell you to, reported that no page matched and left
 * nowhere to tick Create.
 */
async function checkRoleJobsSearch(browser) {
  const page = await signIn(browser, String(process.env.SUPER_ADMIN_EMAIL || '').toLowerCase(), process.env.SUPER_ADMIN_PASSWORD);
  await page.goto(`${APP}/server-management`, { waitUntil: 'networkidle2' });
  await wait(2500);
  await page.evaluate(() => [...document.querySelectorAll('button, a')]
    .find((element) => element.textContent.trim() === 'Role Jobs')?.click());
  await wait(1500);

  const roleValue = await page.evaluate((label) => {
    const select = document.querySelector('.sm-form-stack select');
    return [...select.options].find((option) => option.textContent.trim() === label)?.value;
  }, 'Role Jobs Search Test');
  if (!roleValue) return { searchRoleListed: false };
  await page.select('.sm-form-stack select', roleValue);
  await wait(2500);

  const showsAllByDefault = await page.evaluate(() => document.querySelector('.sm-role-job-toolbar input[type=checkbox]')?.checked);
  await page.type('.sm-role-job-toolbar input[type=search]', 'scan');
  await wait(1200);

  const found = await page.evaluate(() => {
    const card = document.querySelector('[data-role-job="part_scan"]');
    return { card: Boolean(card), hint: Boolean(document.querySelector('.sm-role-job-revealed')) };
  });
  if (!found.card) return { searchRoleListed: true, searchFindsUnheldPage: false };

  // Allowing the page must reveal the Create box the operator was told to ask for.
  await page.evaluate(() => {
    const card = document.querySelector('[data-role-job="part_scan"]');
    [...card.querySelectorAll('label')]
      .find((label) => label.innerText.includes('Allow this page'))
      .querySelector('input').click();
  });
  await wait(600);
  const createBox = await page.evaluate(() => {
    const card = document.querySelector('[data-role-job="part_scan"]');
    return [...card.querySelectorAll('.sm-role-job-actions label')].some((label) => label.innerText.trim() === 'Create');
  });

  return {
    searchRoleListed: true,
    // Guards the filter itself: with the toggle off, only the search can have
    // put this card on screen.
    hiddenPagesToggleStillDefaultsOff: showsAllByDefault === false,
    searchFindsUnheldPage: found.card,
    revealedHintShown: found.hint,
    allowingThePageOffersCreate: createBox,
  };
}

async function run() {
  await grantPartsScanCreate();
  await createSearchRole();
  const browser = await puppeteer.launch({ headless: true });
  let assertions;
  try {
    assertions = { ...(await checkScanner(browser)), ...(await checkRoleJobsSearch(browser)) };
  } finally {
    await browser.close();
    await dropSearchRole();
  }
  console.log(JSON.stringify(assertions, null, 2));
  if (Object.values(assertions).some((ok) => !ok)) process.exitCode = 1;
}

run().catch((error) => { console.error(error); process.exit(1); });
