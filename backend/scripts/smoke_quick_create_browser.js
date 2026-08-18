/**
 * Browser smoke for the 2026-08-18 form fixes.
 *
 * Reproduces the two faults the customer reported and asserts they are gone:
 *
 *   1. Quick create from inside a form (Customers → Add New Customer →
 *      "+ Create Source" → Enter) created the record TWICE, because every
 *      dialog listened for Enter on `document`. Now the topmost dialog alone
 *      answers, so exactly one record is created and the parent form stays open.
 *
 *   2. Clicking the caption of the Customer field on a sales form switched the
 *      whole document to walk-in, because the caption was a <label> whose first
 *      labelable descendant was the walk-in checkbox. It is a <div> now.
 *
 * Needs the backend on :3002 and the frontend on :3000, and the super admin
 * credentials in the root .env (SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD).
 *
 *   node scripts/smoke_quick_create_browser.js
 */
const path = require('path');
const mongoose = require('mongoose');
const puppeteer = require('puppeteer');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const APP = process.env.SMOKE_APP_URL || 'http://localhost:3000';
const EMAIL = String(process.env.SUPER_ADMIN_EMAIL || '').toLowerCase();
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const SOURCE_NAME = `Smoke Source ${Date.now()}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const failures = [];
const check = (name, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`); if (!ok) failures.push(name); };

async function withDb(work) {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });
  try { return await work(require('../models')); } finally { await mongoose.disconnect(); }
}

async function signIn(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.type('input[type="email"]', EMAIL);
  await page.type('input[type="password"]', PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), page.click('button[type="submit"]')]);
  return page;
}

async function quickCreateOnce(page) {
  await page.goto(`${APP}/customers`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Add New Customer')), { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Add New Customer')).click());
  await wait(600);
  await page.evaluate(() => [...document.querySelectorAll('.modal-overlay button')].find((b) => b.textContent.trim() === '+ Create Source').click());
  await wait(500);
  const overlaysBefore = await page.evaluate(() => document.querySelectorAll('.modal-overlay').length);
  check('The quick-create dialog opens above the customer form', overlaysBefore === 2, `${overlaysBefore} overlay(s)`);
  const zIndexes = await page.evaluate(() => [...document.querySelectorAll('.modal-overlay')].map((o) => Number(getComputedStyle(o).zIndex)));
  check('The inner dialog sits above the outer one', zIndexes.length === 2 && zIndexes[1] > zIndexes[0], zIndexes.join(' / '));

  await page.evaluate((name) => {
    const input = document.querySelectorAll('.modal-overlay')[1].querySelector('input[placeholder="Enter name"]');
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, name); input.dispatchEvent(new Event('input', { bubbles: true }));
  }, SOURCE_NAME);
  await page.keyboard.press('Enter');
  await wait(1200);

  const after = await page.evaluate(() => ({
    overlays: document.querySelectorAll('.modal-overlay').length,
    titles: [...document.querySelectorAll('.modal-overlay h3, .modal-overlay h2')].map((h) => h.textContent.trim()),
  }));
  check('One Enter closes only the quick-create dialog', after.overlays === 1 && after.titles[0] === 'New Customer', JSON.stringify(after));

  const count = await withDb(({ LeadSource }) => LeadSource.countDocuments({ name: SOURCE_NAME }));
  check('Exactly one source was created', count === 1, `${count} row(s) named "${SOURCE_NAME}"`);
  await withDb(({ LeadSource }) => LeadSource.deleteMany({ name: SOURCE_NAME }));
}

async function walkInStaysOff(page) {
  await page.goto(`${APP}/parts-sales/invoices`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Create Manual Invoice')), { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Create Manual Invoice')).click());
  await wait(700);
  const result = await page.evaluate(() => {
    const wrap = [...document.querySelectorAll('.modal-overlay .form-label-add')].find((el) => el.querySelector('.walkin-toggle'));
    const box = wrap.querySelector('input[type=checkbox]');
    const before = box.checked;
    wrap.querySelector('span').click();
    return { tag: wrap.tagName, before, after: document.querySelector('.walkin-toggle input[type=checkbox]').checked };
  });
  check('The Customer caption is not a <label>', result.tag === 'DIV', result.tag);
  check('Clicking the caption leaves walk-in off', result.before === false && result.after === false, JSON.stringify(result));
}

(async () => {
  if (!EMAIL || !PASSWORD) { console.error('SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD are required in .env'); process.exit(1); }
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await signIn(browser);
    console.log('\n=== Quick create from inside a form ===');
    await quickCreateOnce(page);
    console.log('\n=== Walk-in switch on the sales forms ===');
    await walkInStaysOff(page);
  } finally { await browser.close(); }
  console.log(`\n${failures.length ? `${failures.length} FAILED` : 'All checks passed'}`);
  process.exit(failures.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
