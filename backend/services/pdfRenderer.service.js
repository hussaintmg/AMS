/**
 * High-fidelity PDF rendering via headless Chrome (puppeteer-core against the
 * system Chrome install). The template's designData is turned into HTML that
 * mirrors the editor canvas, so the downloaded PDF matches the design exactly —
 * no manual coordinate/point conversion, no drift.
 *
 * A single browser instance is launched lazily and reused across requests
 * (including bulk downloads) for speed.
 */
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { buildHtml } = require('./pdfHtml.service');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

function resolveExecutable() {
  for (const path of CHROME_CANDIDATES) {
    if (path && fs.existsSync(path)) return path;
  }
  throw new Error('No Chrome/Chromium executable found. Set CHROME_PATH to your Chrome binary.');
}

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: resolveExecutable(),
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }).catch((error) => { browserPromise = null; throw error; });
  }
  const browser = await browserPromise;
  if (!browser.connected) { browserPromise = null; return getBrowser(); }
  return browser;
}

/** Render one template (array of pages) + data bag into a PDF Buffer. */
async function renderPdf(pages, data, title) {
  const html = await buildHtml(pages || [], data || {});
  const config = pages?.[0]?.config || { width: 794, height: 1123 };
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
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

async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    browserPromise = null;
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { renderPdf, closeBrowser };
