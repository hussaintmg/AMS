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

/**
 * True when `phone` contains a plausible subscriber number.
 *
 * Guards the case where a user types letters into the phone field: the form
 * prefixes a country code, normalizePhone() strips every non-digit, and what
 * survives is a bare "+92" that looks stored-but-meaningless.
 */
function isValidPhone(phone) {
    if (phone === undefined || phone === null) return false;

    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return false;

    // A country code on its own is not a phone number. E.164 allows 15 digits max.
    if (digits.length < 7 || digits.length > 15) return false;

    // Reject inputs that carried letters through (e.g. "abcxyz", "+92abc").
    if (/[a-z]/i.test(String(phone))) return false;

    return true;
}

module.exports = {
    normalizePhone,
    isValidPhone
};
