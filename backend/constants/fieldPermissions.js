/**
 * Field-level visibility catalog.
 *
 * Page permissions answer "may this role open Invoices at all?" and role-job
 * data scope answers "whose invoices?". This catalog answers the third
 * question: *which columns of those invoices* a role is allowed to read —
 * the customer's phone number, the purchase price, the salesperson, and so on.
 *
 * Each page lists a handful of coarse fields rather than one entry per response
 * key. `keys` are the top-level keys of one record in that page's API payload;
 * `lineKeys` are keys inside the record's product lines. Everything the API
 * returns that is not claimed by any catalog field is always visible — the
 * catalog is an allow-list of *restrictable* data, not of all data, so adding a
 * new response key never silently hides it.
 *
 * Keeping the key lists here (rather than in each controller) means the Server
 * Management UI, the API masker and the frontend all read the same definition.
 */

/** Product-line keys every sales document shares. */
const LINE = {
  product: ['name', 'description', 'code', 'item_type', 'part_id', 'vehicle_id', 'vehicle_variant_id', 'vehicle_color_id', 'service_type_id', 'quantity'],
  identifiers: ['barcode', 'code'],
  amounts: ['unit_price', 'discount_amount', 'tax_amount', 'total_price'],
};

/**
 * The fields shared by quotations, bookings, sales orders and invoices —
 * vehicle and parts alike. `only` trims the list for the leaner documents.
 */
const salesDocumentFields = () => ([
  {
    key: 'document',
    group: 'Document',
    label: 'Document number, dates & status',
    keys: [
      'quotation_number', 'booking_number', 'order_number', 'invoice_number', 'pbo_no',
      'external_order_number', 'external_invoice_number', 'external_invoice_reference',
      'quotation_id', 'booking_id', 'sales_order_id', 'sales_order_number', 'invoice_id', 'invoice_status',
      'status', 'approval_status', 'approved_at', 'priority',
      'created_at', 'updated_at', 'invoice_date', 'due_date', 'valid_until', 'validity_days',
      'estimate_sent_at', 'expected_delivery_date',
    ],
  },
  {
    key: 'customer',
    group: 'Customer',
    label: 'Customer name',
    keys: ['customer_id', 'customer_name', 'walk_in', 'walk_in_name'],
  },
  {
    key: 'customer_contact',
    group: 'Customer',
    label: 'Customer phone & e-mail',
    keys: ['customer_phone', 'customer_email', 'walk_in_phone'],
  },
  {
    key: 'products',
    group: 'Products',
    label: 'Product lines (parts / vehicles / services)',
    keys: [
      'line_items', 'item_count', 'item_name', 'vehicle_full_name', 'sale_type',
      'make_name', 'model_name', 'variant_name', 'color_name',
      'part_id', 'part_quantity', 'vehicle_id', 'vehicle_variant_id', 'vehicle_color_id', 'service_type_id',
    ],
    lineKeys: LINE.product,
  },
  {
    key: 'identifiers',
    group: 'Products',
    label: 'Chassis / engine / VIN / barcode',
    keys: ['vin', 'chassis_number', 'engine_number', 'barcode'],
    lineKeys: LINE.identifiers,
  },
  {
    key: 'amounts',
    group: 'Money',
    label: 'Prices, discounts, taxes & totals',
    keys: [
      'subtotal', 'vehicle_price', 'accessories_total', 'discount_amount', 'discount_percentage',
      'tax_amount', 'additional_charges', 'registration_charges', 'insurance_charges', 'other_charges',
      'exchange_value', 'exchange_vehicle_details', 'total_amount', 'grand_total', 'booking_amount',
    ],
    lineKeys: LINE.amounts,
  },
  {
    key: 'payments',
    group: 'Money',
    label: 'Payments & balance',
    keys: [
      'paid_amount', 'balance_amount', 'payment_mode', 'payment_method_id', 'payment_method_name',
      'finance_company', 'finance_amount', 'amount_tendered', 'change_due', 'stock_applied',
    ],
  },
  {
    key: 'sales_person',
    group: 'Ownership',
    label: 'Salesperson',
    keys: ['sale_person', 'seller_id'],
  },
  {
    key: 'logistics',
    group: 'Logistics',
    label: 'Dispatch & delivery',
    keys: ['dispatch_number', 'dispatch_date', 'transport_company', 'ship_from', 'ship_to'],
  },
  {
    key: 'notes',
    group: 'Notes',
    label: 'Notes & terms',
    keys: ['notes', 'terms_and_conditions', 'approval_notes'],
  },
]);

const FIELD_CATALOG = {
  quotations: { label: 'Vehicle Quotations', fields: salesDocumentFields() },
  bookings: { label: 'Vehicle Bookings', fields: salesDocumentFields() },
  sales_orders: { label: 'Vehicle Sales Orders', fields: salesDocumentFields() },
  invoices: { label: 'Vehicle Invoices', fields: salesDocumentFields() },
  part_quotations: { label: 'Parts Quotations', fields: salesDocumentFields() },
  part_invoices: { label: 'Parts Invoices', fields: salesDocumentFields() },

  customers: {
    label: 'Customers',
    fields: [
      { key: 'name', group: 'Identity', label: 'Name & company', keys: ['firstName', 'lastName', 'fullName', 'name', 'first_name', 'last_name', 'companyName'] },
      { key: 'code', group: 'Identity', label: 'Customer code', keys: ['customerCode', 'customer_number', 'importIdentityKey'] },
      { key: 'phone', group: 'Contact', label: 'Phone numbers', keys: ['phone', 'alternatePhone'] },
      { key: 'email', group: 'Contact', label: 'E-mail address', keys: ['email'] },
      { key: 'address', group: 'Contact', label: 'Address, city & country', keys: ['address', 'city', 'state', 'country', 'zipCode'] },
      { key: 'identity_docs', group: 'Identity', label: 'CNIC, NTN, date of birth', keys: ['cnic', 'ntn', 'atlStatus', 'dob', 'relation'] },
      { key: 'classification', group: 'Classification', label: 'Type, source & status', keys: ['customerType', 'source', 'type', 'status', 'importSource', 'isWalkIn'] },
      { key: 'assignment', group: 'Ownership', label: 'Assigned user & department', keys: ['assignedTo', 'department', 'user', 'createdBy', 'updatedBy'] },
      { key: 'financials', group: 'Money', label: 'Spend, balance & sales history', keys: ['salesSummary', 'salesHistory'] },
      { key: 'notes', group: 'Notes', label: 'Description', keys: ['description'] },
    ],
  },

  leads: {
    label: 'Leads',
    fields: [
      { key: 'name', group: 'Identity', label: 'Lead name', keys: ['customerName', 'customer_name'] },
      { key: 'code', group: 'Identity', label: 'Lead number & date', keys: ['leadNo', 'lead_no', 'leadDate'] },
      { key: 'phone', group: 'Contact', label: 'Phone numbers', keys: ['phone', 'alternatePhone'] },
      { key: 'email', group: 'Contact', label: 'E-mail address', keys: ['email'] },
      { key: 'address', group: 'Contact', label: 'Address, city & country', keys: ['address', 'city', 'state', 'country', 'zipCode'] },
      { key: 'classification', group: 'Classification', label: 'Source, type, priority & status', keys: ['source', 'type', 'priority', 'status', 'customerType'] },
      { key: 'value', group: 'Money', label: 'Lead value & probability', keys: ['leadValue', 'probability', 'expectedCloseDate'] },
      { key: 'assignment', group: 'Ownership', label: 'Assigned user & department', keys: ['assignedTo', 'department', 'createdBy', 'updatedBy'] },
      { key: 'activity', group: 'Notes', label: 'Notes, timeline & attachments', keys: ['notes', 'timeline', 'attachments', 'description', 'nextFollowUpAt'] },
    ],
  },

  parts: {
    label: 'Parts Inventory',
    fields: [
      { key: 'identity', group: 'Identity', label: 'Part number, name & barcode', keys: ['part_number', 'name', 'sku', 'barcode'] },
      { key: 'classification', group: 'Classification', label: 'Category, brand & source type', keys: ['category_id', 'category_name', 'brand', 'source_type', 'unit'] },
      { key: 'purchase_price', group: 'Money', label: 'Purchase / cost price', keys: ['purchase_price', 'cost_price', 'costPrice'] },
      { key: 'selling_price', group: 'Money', label: 'Selling price', keys: ['selling_price', 'sellingPrice'] },
      { key: 'stock', group: 'Stock', label: 'Stock levels & reorder points', keys: ['current_stock', 'minimum_stock', 'maximum_stock', 'reorder_level', 'stock_status', 'quantity'] },
      { key: 'supplier', group: 'Supply', label: 'Supplier', keys: ['supplier_id', 'supplier_name'] },
      { key: 'location', group: 'Stock', label: 'Warehouse & bin location', keys: ['warehouse_id', 'warehouse_name', 'bin_location'] },
      { key: 'notes', group: 'Notes', label: 'Description', keys: ['description'] },
    ],
  },

  vehicles: {
    label: 'Vehicles',
    fields: [
      { key: 'identity', group: 'Identity', label: 'Vehicle name, make, model & colour', keys: ['vehicle_name', 'make_name', 'model_name', 'variant_name', 'color_name', 'color_hex', 'year', 'make_id', 'model_id', 'variant_id', 'color_id'] },
      { key: 'identifiers', group: 'Identity', label: 'VIN, chassis, engine & barcode', keys: ['vin', 'chassis_number', 'engine_number', 'barcode'] },
      { key: 'purchase_price', group: 'Money', label: 'Purchase price', keys: ['purchase_price'] },
      { key: 'selling_price', group: 'Money', label: 'Selling price', keys: ['selling_price'] },
      { key: 'stock', group: 'Stock', label: 'Status, condition & mileage', keys: ['status', 'condition_type', 'mileage', 'is_stock_out', 'stock_out_date', 'arrival_date'] },
      { key: 'location', group: 'Stock', label: 'Warehouse & location', keys: ['warehouse_id', 'warehouse_name', 'location'] },
      {
        key: 'dispatch',
        group: 'Logistics',
        label: 'Dispatch details',
        keys: ['is_dispatched', 'dispatch_no', 'dispatch_date', 'dispatch_pbo_no', 'dispatch_invoice_no', 'dispatch_sap_order_no', 'dispatch_transport_company', 'dispatch_builty_no', 'dispatch_ship_from', 'dispatch_ship_to', 'dispatch_sales_order_id', 'dispatch_source'],
      },
      { key: 'notes', group: 'Notes', label: 'Notes', keys: ['notes'] },
    ],
  },

  employees: {
    label: 'Employees',
    fields: [
      { key: 'name', group: 'Identity', label: 'Name & employee code', keys: ['firstName', 'lastName', 'fullName', 'employeeCode'] },
      { key: 'contact', group: 'Contact', label: 'Phone & e-mail', keys: ['phone', 'email'] },
      { key: 'identity_docs', group: 'Identity', label: 'CNIC', keys: ['cnic'] },
      { key: 'employment', group: 'Employment', label: 'Department, role, designation & joining date', keys: ['department', 'role', 'designation', 'joiningDate', 'status'] },
      { key: 'salary', group: 'Money', label: 'Salary', keys: ['salary'] },
    ],
  },
};

/** Every restrictable field key on a page, in catalog order. */
const pageFieldKeys = (pageKey) => (FIELD_CATALOG[pageKey]?.fields || []).map((field) => field.key);

/** The catalog shaped for the Server Management UI. */
const catalogForUi = () => Object.entries(FIELD_CATALOG).map(([pageKey, page]) => ({
  pageKey,
  label: page.label,
  fields: page.fields.map(({ key, label, group }) => ({ key, label, group })),
}));

module.exports = { FIELD_CATALOG, pageFieldKeys, catalogForUi };
