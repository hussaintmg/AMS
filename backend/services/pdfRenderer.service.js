/**
 * High-fidelity PDF rendering via headless Chrome. The template's designData
 * is turned into HTML that mirrors the editor canvas, so the downloaded PDF
 * matches the design exactly — no manual coordinate/point conversion, no
 * drift.
 *
 * A single browser instance is launched lazily and reused across requests
 * (including bulk downloads) for speed.
 *
 * Finding a browser to drive: a machine that already has Chrome/Edge
 * installed (most dev boxes) is used directly — fastest, and nothing extra to
 * install. A server that has never had a browser on it (most bare Linux
 * hosting — this is what broke production: "No Chrome/Chromium executable
 * found") falls back to the Chromium `puppeteer` (not `-core`) downloads for
 * itself during `npm install`, so PDF generation works out of the box with no
 * server-level package install or CHROME_PATH configuration required.
 */
const fs = require('fs');
const puppeteerCore = require('puppeteer-core');
const { buildHtml, buildHtmlFromRaw } = require('./pdfHtml.service');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium',
];

/**
 * A system Chrome/Edge install if one is configured or found on disk;
 * otherwise the Chromium build the full `puppeteer` package downloaded for
 * itself at install time (undefined if that package isn't present either —
 * `npm install` in backend/ pulls it in as a normal dependency).
 */
function resolveExecutable() {
  for (const path of CHROME_CANDIDATES) {
    if (path && fs.existsSync(path)) return { path, bundled: false };
  }
  try {
    // eslint-disable-next-line global-require
    const bundled = require('puppeteer');
    const path = bundled.executablePath();
    if (path && fs.existsSync(path)) return { path, bundled: true };
  } catch { /* full puppeteer not installed — fall through to the error below */ }
  throw new Error(
    'No Chrome/Chromium executable found. Either set CHROME_PATH to a Chrome/Edge binary, '
    + 'or run `npm install` in backend/ so the puppeteer Chromium download can provide one.',
  );
}

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    const { path, bundled } = resolveExecutable();
    // Bundled Chromium ships with everything puppeteer-core needs to drive
    // it; puppeteer-core itself never downloads a browser, so it is always
    // the launcher, whichever binary was found.
    browserPromise = puppeteerCore.launch({
      executablePath: path,
      headless: 'new',
      // Minimal, low-memory shared hosting is the common case in production
      // — these keep a sandboxed Chromium from needing a devtools protocol
      // shared-memory mount or a working GPU it will never have.
      // (`--single-process` looks appealing for a small server but crashes
      // "new" headless Chrome outright — printToPDF fails with "Target
      // closed" every time. Confirmed by testing; do not add it back.)
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    }).catch((error) => {
      browserPromise = null;
      if (bundled && /libnss3|libatk|error while loading shared libraries/i.test(String(error.message))) {
        throw new Error(
          `${error.message}\n\nThe bundled Chromium needs a handful of system shared libraries this `
          + 'server does not have. On Debian/Ubuntu: apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 '
          + 'libcups2 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libasound2',
        );
      }
      throw error;
    });
  }
  const browser = await browserPromise;
  if (!browser.connected) { browserPromise = null; return getBrowser(); }
  return browser;
}

/** Print a full HTML document to a PDF Buffer at the given page size. */
async function printHtml(fullHtml, config = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 });
    const buffer = await page.pdf({
      width: `${config.width || 794}px`,
      height: `${config.height || 1123}px`,
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(buffer);
  } finally {
    await page.close().catch(() => {});
  }
}

/** Render a designer template (array of pages) + data bag into a PDF Buffer. */
async function renderPdf(pages, data, title) {
  const html = await buildHtml(pages || [], data || {});
  const config = pages?.[0]?.config || { width: 794, height: 1123 };
  return printHtml(html, config);
}

/** Render a raw HTML/CSS template (mode: 'html') + data bag into a PDF Buffer. */
async function renderHtmlPdf(rawHtml, css, data, config) {
  const full = buildHtmlFromRaw(rawHtml || '', css || '', data || {}, config || {});
  return printHtml(full, config || { width: 794, height: 1123 });
}

async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    browserPromise = null;
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { renderPdf, renderHtmlPdf, closeBrowser };
