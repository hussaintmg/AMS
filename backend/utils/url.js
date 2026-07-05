/**
 * Public URL helper for uploaded files.
 * Returns a fully qualified URL for any relative file path.
 */

const path = require("path");

const BACKEND_PUBLIC_URL =
  process.env.BACKEND_PUBLIC_URL ||
  `http://localhost:${process.env.API_PORT || 3002}`;

/**
 * Normalise path separators to forward slashes.
 */
const forwardSlashes = (p) => (p || "").replace(/\\/g, "/");

/**
 * Strip known backend folder prefixes so the result looks like a URL path.
 */
const stripPrefixes = (p) => {
  let result = forwardSlashes(p);

  // Strip absolute Windows paths like C:\projects\...
  result = result.replace(/^[A-Za-z]:\//, "");

  // Strip known prefixes that might leak from __dirname
  const prefixes = [
    "backend/uploads",
    "backend\\uploads",
    "uploads",
    "public/uploads",
    "public",
  ];
  for (const prefix of prefixes) {
    if (result.startsWith(prefix + "/") || result.startsWith(prefix)) {
      result = result.slice(prefix.length);
      if (!result.startsWith("/")) result = "/" + result;
      break;
    }
  }

  return result;
};

/**
 * Return a fully-qualified public URL for a file path.
 *
 * @param {string|null|undefined} relativePath - The file path or URL to normalise.
 * @param {object} [req] - Optional Express request object for fallback host.
 * @returns {string} Fully qualified URL.
 */
const getPublicFileUrl = (relativePath, req) => {
  if (!relativePath) return "";

  // Already absolute → return as-is
  if (/^https?:\/\//i.test(relativePath)) return relativePath;

  // Strip prefixes and normalise slashes
  let clean = stripPrefixes(relativePath);

  // Ensure it starts with /
  if (!clean.startsWith("/")) clean = "/" + clean;

  // Prepend backend public URL
  const base = BACKEND_PUBLIC_URL || "http://localhost:3002";
  return `${base}${clean}`;
};

/**
 * Normalise an array or object with publicUrl / url fields to full URLs.
 */
const normaliseAssetUrls = (asset) => {
  if (!asset) return asset;
  const obj = typeof asset.toObject === "function" ? asset.toObject() : { ...asset };

  if (obj.publicUrl) obj.publicUrl = getPublicFileUrl(obj.publicUrl);
  if (obj.url) obj.url = getPublicFileUrl(obj.url);

  return obj;
};

module.exports = { getPublicFileUrl, normaliseAssetUrls, BACKEND_PUBLIC_URL };
