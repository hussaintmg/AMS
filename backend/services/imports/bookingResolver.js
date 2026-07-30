const Booking = require('../../models/Booking.model');
const { normalizeBusinessReference } = require('./valueNormalizer');

const clean = (value) => normalizeBusinessReference(value);

function add(map, value, id) {
  const key = clean(value);
  if (!key || !id) return;
  const ids = map.get(key) || new Set();
  ids.add(String(id));
  map.set(key, ids);
}

class BookingIndex {
  constructor(bookings = []) {
    this.bookings = new Map();
    this.byBookingNumber = new Map();
    this.byExternalBookingNumber = new Map();
    this.byPboNo = new Map();
    this.byExternalOrderNumber = new Map();
    bookings.forEach((booking) => this.add(booking));
  }

  static async load({ session = null } = {}) {
    let query = Booking.find({ status: { $ne: 'cancelled' } }).lean();
    if (session) query = query.session(session);
    return new BookingIndex(await query);
  }

  add(booking) {
    if (!booking?._id) return;
    const id = String(booking._id);
    this.bookings.set(id, booking);
    add(this.byExternalBookingNumber, booking.externalBookingNumber, id);
    add(this.byPboNo, booking.pboNo, id);
    add(this.byBookingNumber, booking.bookingNumber, id);
    add(this.byExternalOrderNumber, booking.externalOrderNumber, id);
  }

  resolve({ bookingNumber, externalBookingNumber, pboNo, externalOrderNumber } = {}) {
    const businessReference = pboNo || externalBookingNumber || bookingNumber;
    const candidates = [
      ['externalBookingNumber', businessReference, this.byExternalBookingNumber],
      ['pboNo', businessReference, this.byPboNo],
      ['bookingNumber', businessReference, this.byBookingNumber],
      ['externalOrderNumber', externalOrderNumber, this.byExternalOrderNumber],
    ];
    let selected = null;
    let selectedBy = null;
    for (const [field, rawValue, map] of candidates) {
      const ids = [...(map.get(clean(rawValue)) || [])];
      if (ids.length > 1) return { booking: null, matchBy: field, ambiguous: true, count: ids.length };
      if (ids.length === 1) {
        if (selected && selected !== ids[0]) {
          return { booking: null, matchBy: `${selectedBy}/${field}`, ambiguous: true, conflict: true, count: 2 };
        }
        selected = ids[0];
        selectedBy = field;
      }
    }
    return selected
      ? { booking: this.bookings.get(selected), matchBy: selectedBy }
      : { booking: null, matchBy: null };
  }
}

module.exports = { BookingIndex };
