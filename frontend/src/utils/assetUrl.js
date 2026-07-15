/**
 * Normalise asset/image URLs returned from the backend.
 * If the URL is already absolute (http/https) use it as-is.
 * If relative, prefix with the backend base URL.
 */

const API_URL = process.env.REACT_APP_API_URL || '/api';
const BACKEND_BASE = API_URL.replace(/\/api\/?$/, '') || 'http://localhost:3002';

export const getAssetUrl = (url) => {
    if (!url) return '';
    if (/^data:|^blob:/i.test(url)) return url;
    if (/^https?:\/\//i.test(url)) {
        try {
            const parsed = new URL(url);
            if (parsed.pathname.startsWith('/uploads/') || parsed.pathname.startsWith('/api/uploads/')) {
                return `${parsed.pathname}${parsed.search}`;
            }
        } catch (_) { /* retain the original URL */ }
        return url;
    }
    const clean = url.startsWith('/') ? url : `/${url}`;
    return `${BACKEND_BASE}${clean}`;
};

export const getAvatarUrl = (avatar) => {
    return getAssetUrl(avatar);
};

export default getAssetUrl;
