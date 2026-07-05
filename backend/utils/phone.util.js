/**
 * Phone utility helpers.
 * Normalizes Pakistan local mobile numbers to +92 format.
 */

function normalizePhone(phone) {
    if (phone === undefined || phone === null) {
        return phone;
    }

    const original = String(phone).trim();
    if (!original) {
        return original;
    }

    let normalized = original.replace(/[^\d+]/g, '');
    if (normalized.startsWith('+')) {
        normalized = normalized.slice(1);
    }

    if (normalized.startsWith('00')) {
        normalized = normalized.slice(2);
    }

    normalized = normalized.replace(/^0+/, '');

    if (normalized.startsWith('92')) {
        return `+${normalized}`;
    }

    if (normalized.startsWith('3')) {
        return `+92${normalized}`;
    }

    return original;
}

module.exports = {
    normalizePhone
};
