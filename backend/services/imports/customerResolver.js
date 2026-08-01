const crypto = require('crypto');
const Customer = require('../../models/Customer.model');
const { normalizePhone } = require('../../utils/phone.util');
const { inferCustomerType, normalizeCustomerType } = require('./valueNormalizer');
const { debugEvent, importTrace } = require('./importDebugAudit');

const clean = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
const compact = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
// Dealer Pro spells the same company several ways across files ("Habib Bank
// Limited" / "Habib Bank Ltd", "(Pvt.)Ltd." / "Private Limited"). Folding the
// usual corporate tokens makes every spelling produce one name key, so one
// customer record — otherwise the variants each create a customer and later
// rows fail with conflicting references.
const CORPORATE_TOKEN_FOLDS = {
  limited: 'ltd',
  private: 'pvt',
  company: 'co',
  corporation: 'corp',
  incorporated: 'inc',
  brothers: 'bros',
};
const normalizePersonName = (value) => clean(value)
  .replace(/^(?:m\/s\.?|mr\.?|mrs\.?|ms\.?|miss\.?|dr\.?)\s+/i, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .split(' ')
  .filter((token) => token && token !== 'and')
  .map((token) => CORPORATE_TOKEN_FOLDS[token] || token)
  .join(' ');
const normalizedPhone = (value) => String(normalizePhone(value) || '').replace(/\D/g, '');

function identityCandidates(data = {}) {
  return [
    ['customerCode', clean(data.customerCode).toLowerCase()],
    ['ntn', compact(data.ntn)],
    ['cnic', compact(data.cnic)],
    ['email', clean(data.email).toLowerCase()],
    ['phone', normalizedPhone(data.phone)],
  ].filter(([, value]) => value);
}

// Identifiers that legally belong to one customer. Everything else (email, phone,
// name) can legitimately be shared between customers.
const STRONG_IDENTITY_FIELDS = new Set(['customerCode', 'ntn', 'cnic']);

function nameCandidate(data = {}) {
  return normalizePersonName(data.customerName || data.name);
}

function candidateReferences(data = {}) {
  return [
    ['bookingNumber', data.bookingNumber || data.bookingNo || data.pboNo],
    ['externalOrderNumber', data.externalOrderNumber || data.orderNumber],
    ['externalInvoiceNumber', data.externalInvoiceNumber || data.sourceInvoiceNumber],
    ['invoiceNumber', data.invoiceNumber || data.internalInvoiceNumber],
    ['chassisNumber', data.chassisNumber || data.vin],
    ['engineNumber', data.engineNumber],
  ].map(([field, value]) => [field, clean(value).toLowerCase()]).filter(([, value]) => value);
}

function relatedValues(related = {}) {
  const values = [];
  const push = (entity, reference, customerId, details = {}) => {
    if (customerId && reference) values.push({ entity, reference, customerId: String(customerId), details });
  };
  const bookings = related.bookings instanceof Map ? [...related.bookings.values()] : (related.bookings || []);
  const orders = related.orders instanceof Map ? [...related.orders.values()] : (related.orders || []);
  const invoices = related.invoices instanceof Map ? [...related.invoices.values()] : (related.invoices || []);
  const vehicles = related.vehicles instanceof Map ? [...related.vehicles.values()] : (related.vehicles || []);
  const vehicleById = new Map(vehicles.filter((vehicle) => vehicle?._id).map((vehicle) => [String(vehicle._id), vehicle]));
  const bookingById = new Map(bookings.filter((booking) => booking?._id).map((booking) => [String(booking._id), booking]));
  const orderById = new Map(orders.filter((order) => order?._id).map((order) => [String(order._id), order]));
  const refs = candidateReferences(related.input || {});
  const has = (field, value, record) => refs.some(([candidateField, candidate]) => candidateField === field && candidate === clean(value).toLowerCase())
    && record?.customer;

  bookings.forEach((booking) => {
    if (has('bookingNumber', booking.bookingNumber, booking)) push('Booking', booking.bookingNumber, booking.customer, { field: 'bookingNumber', value: booking.bookingNumber });
    if (has('externalOrderNumber', booking.externalOrderNumber, booking)) push('Booking', booking.externalOrderNumber, booking.customer, { field: 'externalOrderNumber', value: booking.externalOrderNumber });
  });
  orders.forEach((order) => {
    const customerId = order.customer || bookingById.get(String(order.booking))?.customer;
    if (!customerId) return;
    [['externalOrderNumber', order.externalOrderNumber], ['bookingNumber', order.pboNo], ['externalInvoiceNumber', order.invoiceNo], ['invoiceNumber', order.invoiceNo]]
      .forEach(([field, value]) => { if (has(field, value, { customer: customerId })) push('SalesOrder', value, customerId, { field, value }); });
    const vehicle = vehicleById.get(String(order.vehicle));
    if (vehicle) {
      if (has('chassisNumber', vehicle.chassisNumber || vehicle.vin, { customer: customerId })) push('SalesOrder/Vehicle', vehicle.chassisNumber || vehicle.vin, customerId, { field: 'chassisNumber', value: vehicle.chassisNumber || vehicle.vin });
      if (has('engineNumber', vehicle.engineNumber, { customer: customerId })) push('SalesOrder/Vehicle', vehicle.engineNumber, customerId, { field: 'engineNumber', value: vehicle.engineNumber });
    }
  });
  invoices.forEach((invoice) => {
    const customerId = invoice.customer || orderById.get(String(invoice.salesOrder))?.customer;
    if (!customerId) return;
    [['externalInvoiceNumber', invoice.externalInvoiceNumber], ['invoiceNumber', invoice.invoiceNumber]]
      .forEach(([field, value]) => { if (has(field, value, { customer: customerId })) push('Invoice', value, customerId, { field, value }); });
  });
  return values;
}

function resolveRelatedCustomer(data = {}, related = {}) {
  const references = relatedValues({ ...related, input: data });
  const byCustomer = new Map();
  references.forEach((candidate) => {
    const entries = byCustomer.get(candidate.customerId) || [];
    entries.push(candidate);
    byCustomer.set(candidate.customerId, entries);
  });
  const ids = [...byCustomer.keys()];
  if (ids.length > 1) {
    return {
      customer: null,
      ambiguous: true,
      conflict: true,
      matchBy: 'relatedReferences',
      count: ids.length,
      conflicts: references.map(({ entity, reference, customerId, details }) => ({ entity, reference, customerId, ...details })),
    };
  }
  if (ids.length === 1) {
    const customer = related.customers instanceof Map
      ? related.customers.get(ids[0])
      : (related.customers || []).find((entry) => String(entry._id) === ids[0]);
    return { customer: customer || null, matchBy: references[0]?.entity || 'relatedRecord', references };
  }
  return { customer: null, matchBy: null, references: [] };
}

function importIdentityKey(data = {}) {
  const first = identityCandidates(data)[0];
  if (!first) return '';
  const [field, value] = first;
  // A phone or email is routinely shared between customers on this paperwork,
  // so a weak-led key also carries the name — otherwise two different buyers
  // behind one desk phone collide on the unique importIdentityKey index and the
  // second silently reuses the first one's record.
  const seed = STRONG_IDENTITY_FIELDS.has(field)
    ? value
    : [value, nameCandidate(data)].filter(Boolean).join('|');
  return `customer:${field}:${crypto.createHash('sha256').update(seed).digest('hex')}`;
}

// Placeholder domain for customers imported without a source email. A real
// email seen later (enrichCustomer) is allowed to replace these.
const GENERATED_EMAIL_DOMAIN = 'import.amserp.local';

function isGeneratedEmail(value) {
  return String(value || '').toLowerCase().endsWith(`@${GENERATED_EMAIL_DOMAIN}`);
}

function splitCustomerName(customerName, customerType = 'individual') {
  const original = clean(customerName);
  const withoutTitle = original.replace(/^(?:m\/s\.?|mr\.?|mrs\.?|ms\.?|miss\.?|dr\.?)\s+/i, '').trim();
  if (customerType === 'corporate') {
    return { firstName: withoutTitle || original, lastName: '', companyName: withoutTitle || original };
  }
  const parts = withoutTitle.split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || '', lastName: parts.join(' '), companyName: '' };
}

class CustomerIndex {
  constructor(customers = []) {
    this.customers = new Map();
    this.byField = new Map();
    this.byName = new Map();
    this.nextCode = 1;
    customers.forEach((customer) => this.add(customer));
  }

  static async load({ session = null } = {}) {
    let query = Customer.find({ deletedAt: null }).lean();
    if (session) query = query.session(session);
    return new CustomerIndex(await query);
  }

  add(customer) {
    if (!customer?._id) return;
    const id = String(customer._id);
    this.customers.set(id, customer);
    identityCandidates(customer).forEach(([field, value]) => {
      const key = `${field}:${value}`;
      const ids = this.byField.get(key) || new Set();
      ids.add(id);
      this.byField.set(key, ids);
    });
    const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
    [fullName, customer.companyName].filter(Boolean).forEach((name) => {
      const key = normalizePersonName(name);
      if (!key) return;
      const ids = this.byName.get(key) || new Set();
      ids.add(id);
      this.byName.set(key, ids);
    });
    const codeMatch = clean(customer.customerCode).match(/^CUS-(\d+)$/i);
    if (codeMatch) this.nextCode = Math.max(this.nextCode, Number(codeMatch[1]) + 1);
  }

  remove(customer) {
    if (!customer?._id) return;
    const id = String(customer._id);
    this.customers.delete(id);
    [...this.byField.values(), ...this.byName.values()].forEach((ids) => ids.delete(id));
  }

  allocateCustomerCode() {
    const code = `CUS-${String(this.nextCode).padStart(6, '0')}`;
    this.nextCode += 1;
    return code;
  }

  /**
   * Build a unique placeholder email from the customer name when the source
   * row has none. Collisions with any indexed email (existing or created
   * earlier in this batch) get random digits appended until unique.
   */
  generateFallbackEmail(sourceName) {
    const base = compact(sourceName).slice(0, 40) || 'customer';
    let candidate = `${base}@${GENERATED_EMAIL_DOMAIN}`;
    let attempts = 0;
    while (this.byField.has(`email:${candidate}`) && attempts < 50) {
      candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}@${GENERATED_EMAIL_DOMAIN}`;
      attempts += 1;
    }
    return candidate;
  }

  resolve(data = {}) {
    const identity = identityCandidates(data);
    const normalizedName = nameCandidate(data);
    const finish = (result) => {
      const candidateIds = (result.conflicts || [])
        .map((conflict) => String(conflict.customerId || ''))
        .filter(Boolean);
      const ambiguousCandidates = [...new Set(candidateIds)]
        .map((id) => this.customers.get(id))
        .filter(Boolean)
        .map((customer) => ({
          id: String(customer._id),
          name: customer.companyName || [customer.firstName, customer.lastName].filter(Boolean).join(' '),
          customerType: customer.customerType || '',
        }));
      debugEvent('customer.lookup', {
        _meta: data._meta,
        sourceCustomerValue: data.customerName || data.name || '',
        normalizedCustomerValue: normalizedName,
        sourceIdentifiers: {
          customerCode: data.customerCode || '',
          cnic: data.cnic || '',
          ntn: data.ntn || '',
          email: data.email || '',
          phone: data.phone || '',
        },
        lookupPriority: ['customerCode', 'ntn', 'cnic', 'email', 'phone', 'customerName'],
        normalizedCandidates: identity.map(([field, value]) => ({ field, value }))
          .concat(normalizedName ? [{ field: 'customerName', value: normalizedName }] : []),
        matchStrategy: result.matchBy || null,
        existingCustomerFound: Boolean(result.customer),
        matchedCustomer: result.customer ? {
          id: String(result.customer._id),
          name: result.customer.companyName
            || [result.customer.firstName, result.customer.lastName].filter(Boolean).join(' '),
          customerType: result.customer.customerType || '',
        } : null,
        ambiguous: Boolean(result.ambiguous),
        conflict: Boolean(result.conflict),
        ambiguousCandidates,
      }, result.ambiguous ? { section: 'customers', bucket: 'ambiguous', level: 'error' } : {
        section: result.customer ? 'customers' : null,
        bucket: result.customer ? 'existing' : null,
      });
      return result;
    };

    const matches = [];
    for (const [field, value] of identity) {
      const ids = [...(this.byField.get(`${field}:${value}`) || [])];
      if (ids.length > 1) {
        if (STRONG_IDENTITY_FIELDS.has(field)) {
          // Two records claiming one tax number / customer code is a genuine
          // duplicate that needs a human decision.
          return finish({
            customer: null,
            matchBy: field,
            ambiguous: true,
            count: ids.length,
            conflicts: ids.map((id) => ({ field, value, customerId: id })),
          });
        }
        // A phone/email serving several customers is normal here (one desk
        // number covers many buyers), so all of them stay as candidates and
        // the name arbitrates below.
        ids.forEach((id) => matches.push({ field, value, id }));
        continue;
      }
      if (ids.length === 1) matches.push({ field, value, id: ids[0] });
    }
    if (normalizedName) {
      const ids = [...(this.byName.get(normalizedName) || [])];
      if (ids.length > 1) {
        return finish({
          customer: null,
          matchBy: 'customerName',
          ambiguous: true,
          count: ids.length,
          conflicts: ids.map((id) => ({ field: 'customerName', value: normalizedName, customerId: id })),
        });
      }
      if (ids.length === 1) matches.push({ field: 'customerName', value: normalizedName, id: ids[0] });
    }
    const ids = [...new Set(matches.map((match) => match.id))];
    const nameKeysOf = (customer) => {
      const keys = new Set();
      const fullName = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ');
      [fullName, customer?.companyName].filter(Boolean).forEach((name) => {
        const key = normalizePersonName(name);
        if (key) keys.add(key);
      });
      return keys;
    };
    const asConflicts = (entries) => entries.map(({ field, value, id }) => ({ field, value, customerId: id }));
    if (ids.length > 1) {
      // A tax number identifies exactly one legal entity; a phone or email is
      // routinely shared (a company and its contact person, a family, a dealer
      // desk). When both point somewhere, the strong identifier decides instead
      // of the row being rejected — the weaker match is reported, not obeyed.
      const strongMatches = matches.filter((match) => STRONG_IDENTITY_FIELDS.has(match.field));
      const strongIds = [...new Set(strongMatches.map((match) => match.id))];
      if (strongIds.length > 1) {
        // Two different tax identities genuinely fight over this row — a human
        // has to look at it; guessing would re-home someone's paperwork.
        return finish({
          customer: null,
          matchBy: strongMatches.map((match) => match.field).join('/'),
          ambiguous: true,
          conflict: true,
          count: strongIds.length,
          conflicts: asConflicts(strongMatches),
        });
      }
      if (strongIds.length === 1) {
        const strongMatch = strongMatches[0];
        const overruled = matches.filter((match) => match.id !== strongMatch.id);
        return finish({
          customer: this.customers.get(strongMatch.id),
          matchBy: strongMatch.field,
          weakConflicts: asConflicts(overruled),
        });
      }
      // No strong identity in play. The name is the next-best evidence: this
      // dealer's files reuse one desk phone across many buyers (verified in the
      // source), so a diverging phone/email match is reported, never obeyed.
      const nameMatch = matches.find((match) => match.field === 'customerName');
      if (nameMatch) {
        const overruled = matches.filter((match) => match.id !== nameMatch.id);
        return finish({
          customer: this.customers.get(nameMatch.id),
          matchBy: 'customerName',
          weakConflicts: asConflicts(overruled),
        });
      }
      if (normalizedName) {
        // Phone and email each point at somebody else and neither carries this
        // row's name — they are shared contact details, not this customer.
        return finish({ customer: null, matchBy: null, weakConflicts: asConflicts(matches) });
      }
      return finish({
        customer: null,
        matchBy: matches.map((match) => match.field).join('/'),
        ambiguous: true,
        conflict: true,
        count: ids.length,
        conflicts: asConflicts(matches),
      });
    }
    if (ids.length === 1) {
      const customer = this.customers.get(ids[0]);
      const hasStrongOrNameEvidence = matches.some((match) => (
        STRONG_IDENTITY_FIELDS.has(match.field) || match.field === 'customerName'
      ));
      // A phone/email-only match whose stored name disagrees with the row's own
      // name is a shared contact number, not the same customer — reusing it
      // would silently merge two different buyers into one record.
      if (!hasStrongOrNameEvidence && normalizedName && customer && !nameKeysOf(customer).has(normalizedName)) {
        return finish({ customer: null, matchBy: null, weakConflicts: asConflicts(matches) });
      }
      return finish({ customer, matchBy: matches[0].field });
    }
    return finish({ customer: null, matchBy: null });
  }

  async resolveOrCreate(data, {
    userId = null,
    session = null,
    allowCreate = true,
    related = null,
    allowNameOnly = false,
  } = {}) {
    importTrace("[CUSTOMER_RESOLVE_START]", {
      sourceName: data.customerName || data.name || '',
      customerCode: data.customerCode || '',
      cnic: data.cnic || '',
      ntn: data.ntn || '',
      phone: data.phone || '',
      email: data.email || '',
    });
    const filter = {
      resolver: 'CustomerIndex',
      identityCandidates: identityCandidates(data).map(([field, value]) => ({ field, value })),
      normalizedName: nameCandidate(data),
    };
    importTrace("[CUSTOMER_QUERY]", { filter });
    const direct = this.resolve(data);
    importTrace("[CUSTOMER_QUERY_RESULT]", {
      found: Boolean(direct.customer),
      customerId: direct.customer?._id ?? null,
      existingCustomer: direct.customer || null,
    });
    debugEvent('customer.resolution.started', {
      _meta: data._meta,
      sourceCustomerValue: data.customerName || data.name || '',
      allowCreate,
      directMatchStrategy: direct.matchBy || null,
      directCustomerId: direct.customer?._id ? String(direct.customer._id) : null,
      directAmbiguous: Boolean(direct.ambiguous),
    });
    if (direct.ambiguous) return { ...direct, created: false };
    const relatedResolution = related ? resolveRelatedCustomer(data, related) : null;
    if (relatedResolution?.ambiguous) return { ...relatedResolution, created: false };
    if (direct.customer && relatedResolution?.customer
      && String(direct.customer._id) !== String(relatedResolution.customer._id)) {
      if (STRONG_IDENTITY_FIELDS.has(direct.matchBy)) {
        // The row's tax number says one customer, its booking/order chain says
        // another — that is a genuine identity fight a human has to settle.
        return {
          customer: null,
          matchBy: 'direct/relatedReferences',
          ambiguous: true,
          conflict: true,
          count: 2,
          conflicts: [
            { entity: 'Customer', customerId: String(direct.customer._id), field: direct.matchBy },
            ...(relatedResolution.references || []),
          ],
          created: false,
        };
      }
      // The booking/order this row references already belongs to a customer; a
      // name/phone coincidence elsewhere must not re-home the transaction. The
      // overruled direct match stays visible in the audit as a weak conflict.
      debugEvent('customer.related_reference_overruled_direct', {
        _meta: data._meta,
        sourceCustomerValue: data.customerName || data.name || '',
        directMatchBy: direct.matchBy,
        directCustomerId: String(direct.customer._id),
        keptCustomerId: String(relatedResolution.customer._id),
        references: relatedResolution.references || [],
      });
      this.add(relatedResolution.customer);
      return {
        ...relatedResolution,
        created: false,
        weakConflicts: [{ field: direct.matchBy, customerId: String(direct.customer._id) }],
      };
    }
    if (direct.customer || !allowCreate) return { ...direct, created: false };
    if (relatedResolution?.customer) {
      this.add(relatedResolution.customer);
      return { ...relatedResolution, created: false };
    }
    const sourceName = clean(data.customerName || data.name);

    const customerType = normalizeCustomerType(data.customerType)
      || inferCustomerType(sourceName, {
        cnic: data.cnic,
        explicitPersonal: data.explicitPersonal === true,
      });
    debugEvent('customer.creation.evaluated', {
      _meta: data._meta,
      sourceCustomerValue: sourceName,
      inferredCustomerType: customerType || 'unknown',
      creationAllowed: allowCreate,
    });
    if (!['individual', 'corporate'].includes(customerType)) {
      debugEvent('customer.creation.failed', {
        _meta: data._meta,
        sourceCustomerValue: sourceName,
        exactReason: 'Customer type is neither explicit nor safely inferable.',
        missingField: 'customerType (explicit or safely inferable)',
      }, { section: 'customers', bucket: 'failed', level: 'error' });
      return {
        customer: null,
        matchBy: null,
        created: false,
        missingField: 'customerType (explicit or safely inferable)',
      };
    }
    const forbidden = new Set([
      'order number', 'invoice number', 'booking number', 'dispatch number',
      'seller', 'general', 'unknown', 'blank',
    ]);
    if (!sourceName || forbidden.has(sourceName.toLowerCase()) || !nameCandidate({ customerName: sourceName })) {
      debugEvent('customer.creation.failed', {
        _meta: data._meta,
        sourceCustomerValue: sourceName,
        exactReason: 'Customer name is missing, forbidden, or not a verified person/company name.',
        missingField: 'customerName (verified)',
      }, { section: 'customers', bucket: 'failed', level: 'error' });
      return { customer: null, matchBy: null, created: false, missingField: 'customerName (verified)' };
    }
    const names = splitCustomerName(sourceName, customerType);
    if (!names.firstName) {
      debugEvent('customer.creation.failed', {
        _meta: data._meta,
        sourceCustomerValue: sourceName,
        exactReason: 'Customer name did not produce a usable first/company name.',
        missingField: 'customerName',
      }, { section: 'customers', bucket: 'failed', level: 'error' });
      return { customer: null, matchBy: null, created: false, missingField: 'customerName' };
    }
    if (!clean(data.phone) && !allowNameOnly) {
      debugEvent('customer.creation.failed', {
        _meta: data._meta,
        sourceCustomerValue: sourceName,
        exactReason: 'Verified phone is required for customer creation outside Order Intake.',
        missingField: 'phone',
      }, { section: 'customers', bucket: 'failed', level: 'error' });
      return { customer: null, matchBy: null, created: false, missingField: 'phone' };
    }

    const sourceEmail = clean(data.email).toLowerCase();
    const document = {
      customerCode: this.allocateCustomerCode(),
      importIdentityKey: importIdentityKey(data),
      ...names,
      email: sourceEmail || this.generateFallbackEmail(sourceName),
      phone: normalizePhone(data.phone),
      alternatePhone: normalizePhone(data.alternatePhone || ''),
      customerType,
      relation: clean(data.relation),
      dob: data.dob || null,
      cnic: clean(data.cnic),
      ntn: clean(data.ntn),
      atlStatus: clean(data.atlStatus),
      address: clean(data.address),
      city: clean(data.city),
      importSource: 'legacy_import',
      createdBy: userId,
    };
    importTrace("[CUSTOMER_CREATE_ATTEMPT]", {
      payload: document,
    });

    try {
      const customer = new Customer(document);
      // save() validates; its ValidationError is logged by the catch below.
      // (validateSync() here printed a deprecation warning per created customer.)
      await customer.save({ session });
      importTrace("[CUSTOMER_SAVE_SUCCESS]", {
        customerId: customer._id,
      });
      let verificationQuery = Customer.findById(customer._id).lean();
      if (session) verificationQuery = verificationQuery.session(session);
      const verifiedCustomer = await verificationQuery;
      importTrace("[CUSTOMER_DB_VERIFY]", {
        existsAfterSave: Boolean(verifiedCustomer),
        verifiedCustomer,
      });
      if (!verifiedCustomer) {
        throw new Error(`Customer ${customer._id} was not found after save.`);
      }
      this.add(verifiedCustomer);
      debugEvent('customer.creation.completed', {
        _meta: data._meta,
        sourceCustomerValue: sourceName,
        customerId: String(verifiedCustomer._id),
        customerName: verifiedCustomer.companyName || [verifiedCustomer.firstName, verifiedCustomer.lastName].filter(Boolean).join(' '),
        customerType: verifiedCustomer.customerType,
        matchStrategy: 'created',
        newlyCreated: true,
        finalCustomerIdAssigned: String(verifiedCustomer._id),
      }, { section: 'customers', bucket: 'newlyCreated' });
      return {
        customer: verifiedCustomer,
        matchBy: 'created',
        created: true,
        // e.g. a shared desk phone pointed at somebody else — kept for the audit.
        weakConflicts: direct.weakConflicts || [],
      };
    } catch (error) {
      console.error("[CUSTOMER_SAVE_FAILED]", {
        name: error.name,
        message: error.message,
        code: error.code,
        keyPattern: error.keyPattern,
        keyValue: error.keyValue,
        validationErrors: error.errors,
        stack: error.stack,
      });
      if (error.code === 11000 && document.importIdentityKey) {
        let query = Customer.findOne({ importIdentityKey: document.importIdentityKey }).lean();
        if (session) query = query.session(session);
        const customer = await query;
        if (customer) {
          this.add(customer);
          debugEvent('customer.creation.race_reused', {
            _meta: data._meta,
            sourceCustomerValue: sourceName,
            customerId: String(customer._id),
            matchStrategy: 'importIdentityKey',
            newlyCreated: false,
            finalCustomerIdAssigned: String(customer._id),
          }, { section: 'customers', bucket: 'existing' });
          return { customer, matchBy: 'importIdentityKey', created: false };
        }
      }
      debugEvent('customer.creation.failed', {
        _meta: data._meta,
        sourceCustomerValue: sourceName,
        exactReason: error.message,
        errorName: error.name,
        errorCode: error.code || null,
      }, { section: 'customers', bucket: 'failed', level: 'error' });
      throw error;
    }
  }
}
async function findExistingCustomer(data = {}) {
  const index = await CustomerIndex.load();
  return index.resolve(data);
}

module.exports = {
  CustomerIndex,
  findExistingCustomer,
  identityCandidates,
  importIdentityKey,
  isGeneratedEmail,
  nameCandidate,
  normalizePersonName,
  resolveRelatedCustomer,
  splitCustomerName,
};
