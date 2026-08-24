/**
 * The page catalog: what every screen shows and offers, so a role can be
 * granted or denied each part of it.
 *
 * `pageCapabilities.js` answers "which write actions does this page have";
 * `fieldPermissions.js` answers "which fields of a record may the API send".
 * Neither describes the *screen* — the table columns, the drawer rows and the
 * buttons inside the drawer, the "+ Create X" shortcuts inside the create and
 * edit forms, and the dropdowns those forms are filled from. Role Jobs could
 * not offer control over any of that because nothing named it. This file does.
 *
 * Every key here is matched in the browser by the same words the screen uses:
 * a column key is the slug of its header ("Selling Price" → `selling_price`),
 * a drawer field key is the slug of its row label, a quick-create key is the
 * record it raises, and a dropdown key is the field it fills. That is what
 * lets one central gate (frontend `utils/viewGate.js`) enforce the role's
 * choices on forty screens without each screen being rewritten.
 *
 * `scope: true` on a dropdown means "whose records may this role pick from" is
 * a meaningful question (users, customers, employees, departments…) *and* the
 * endpoint feeding it can answer it — `utils/dropdownScope.js` is applied by the
 * customer, department, employee, user and warehouse lists, and by the Leads and
 * Customers meta endpoints. Anything else is `scope: false`: shown or hidden,
 * nothing in between.
 *
 * The distinction is not cosmetic. Role Jobs draws the four "whose records"
 * modes from this flag, so claiming it for a list nothing scopes puts an option
 * in front of an administrator that does nothing when they save it — which is
 * indistinguishable from the permission engine being broken. Company-wide
 * reference data (suppliers, roles, categories, colours) has no owner to scope
 * by in the first place; stock and documents are already narrowed by the page's
 * own data scope.
 *
 * Kept honest by `scripts/audit_page_operations.js --catalog` and
 * `scripts/test_role_permissions.js`, which fail when this file claims a page,
 * action, column or dropdown the code does not implement.
 */

/** Table column: the header text, and a stable key derived from it. */
const col = (label, key) => ({ key: key || slug(label), label });
/** Drawer row / section, keyed the same way. */
const row = col;
/** A "+ Create X" shortcut: what it raises and which master-data page owns it. */
const qc = (key, label, owner) => ({ key, label, owner });
/** A dropdown: what it fills, from which model, and whether it can be scoped. */
const dd = (key, label, model, scope = false) => ({ key, label, model, scope });

/** "Selling Price" → "selling_price"; "Chassis / VIN" → "chassis_vin". */
const slug = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

// ── Shared blocks ─────────────────────────────────────────────────────────

const AUDIT_ROWS = [row('Created By'), row('Created At'), row('Updated By'), row('Updated At')];

const CUSTOMER_PICK = dd('customer', 'Customer', 'Customer', true);
const PAYMENT_METHOD_PICK = dd('payment_method', 'Payment method', 'PaymentMethod');
const CUSTOMER_QC = qc('customer', '+ Customer', 'customers');
// A delivery can bring in something never stocked before, so the gate entry can
// raise the part itself — governed by the Parts page's own Create right.
const PART_QC = qc('part', '+ Create Part', 'parts');
const SERVICE_TYPE_QC = qc('service_type', '+ Create Service Type', 'service_master');
const PAYMENT_METHOD_QC = qc('payment_method', '+ Create Payment Method', 'payment_methods');

/**
 * The document screens (quotations, bookings, orders, invoices) share one
 * form and one drawer on both sides of the business, so their catalog entries
 * are stamped from these.
 */
const salesDocumentForm = (extraDropdowns = []) => ({
  quickCreate: [CUSTOMER_QC, SERVICE_TYPE_QC, PAYMENT_METHOD_QC],
  dropdowns: [
    CUSTOMER_PICK,
    dd('product', 'Product / vehicle / part', 'Vehicle|Part'),
    dd('service_type', 'Service type (service charges)', 'ServiceType'),
    PAYMENT_METHOD_PICK,
    ...extraDropdowns,
  ],
});
const salesFilters = (extra = []) => ({
  dropdowns: [dd('status', 'Status', 'static'), CUSTOMER_PICK, ...extra],
});
const salesDrawer = (extras = []) => ({
  fields: [
    row('Details'), row('Status'), row('Items'), row('Service Charges'),
    row('Payment Summary'), row('Payment History'), row('Notes'),
  ],
  extras: [
    { key: 'drawer.record_payment', label: 'Record Payment form in drawer', match: ['Record Payment'] },
    { key: 'drawer.download_pdf', label: 'Download PDF button in drawer', match: ['Download PDF'] },
    { key: 'drawer.send_email', label: 'Send email button in drawer', match: ['Send email', 'Email'] },
    ...extras,
  ],
});

const quotationEntry = (label, path, productLabel) => ({
  label, path,
  columns: [col('Quote #'), col('Date'), col('Customer'), col(productLabel, 'products'), col('Total'), col('Service Charges'), col('Status')],
  drawer: salesDrawer(),
  forms: {
    create: salesDocumentForm(),
    edit: salesDocumentForm(),
    filters: salesFilters(),
  },
});

const invoiceEntry = (label, path, productLabel) => ({
  label, path,
  columns: [
    col('Invoice #'), col('Date'), col('Due Date'), col('Customer'), col('Type'),
    col(productLabel, 'products'), col('Total'), col('Paid'), col('Balance'),
    col('Payment Term'), col('Service Charges'), col('Status'),
  ],
  drawer: salesDrawer([
    { key: 'drawer.update_payment_method', label: 'Update payment method in drawer', match: ['Update Payment Method'] },
  ]),
  forms: {
    create: salesDocumentForm([dd('payment_term', 'Payment terms (Paid / Credit)', 'static'), dd('invoice_type', 'Invoice type', 'static')]),
    edit: salesDocumentForm([dd('payment_term', 'Payment terms (Paid / Credit)', 'static')]),
    filters: salesFilters([dd('payment_term', 'Paid / Credit tab', 'static')]),
  },
});

// ── The catalog ───────────────────────────────────────────────────────────

const PAGE_CATALOG = {
  // ── CRM ─────────────────────────────────────────────────────────────────
  leads: {
    label: 'Leads', path: '/leads',
    columns: [col('Customer'), col('Contact'), col('Source'), col('Priority'), col('Status'), col('Assigned To'), col('Value'), col('Follow-Up')],
    drawer: {
      fields: [
        row('Customer Name'), row('Email'), row('Phone'), row('Alternate Phone'), row('Lead Value'), row('Description'),
        row('Source'), row('Type'), row('Status'), row('Customer Type'), row('Probability'), row('Expected Close'), row('Next Follow-Up'),
        row('Address'), row('City'), row('State'), row('Country'), row('Zip Code'), row('Assigned To'), row('Department'), ...AUDIT_ROWS,
      ],
      extras: [
        { key: 'drawer.assign', label: 'Assign button in drawer', match: ['Assign'] },
        { key: 'drawer.convert', label: 'Convert button in drawer', match: ['Convert'] },
        { key: 'drawer.lost', label: 'Mark Lost button in drawer', match: ['Lost'] },
        { key: 'drawer.status', label: 'Change Status in drawer', match: ['Status', 'Create Status'] },
        { key: 'drawer.edit', label: 'Edit button in drawer', match: ['Edit'] },
        { key: 'drawer.delete', label: 'Delete button in drawer', match: ['Delete Lead', 'Delete'] },
      ],
    },
    forms: {
      create: {
        quickCreate: [qc('city', '+ Create City', 'lead_master'), qc('source', '+ Create Source', 'lead_master'), qc('type', '+ Create Type', 'lead_master'), qc('priority', '+ Create Priority', 'lead_master'), qc('status', '+ Create Status', 'status_management'), qc('department', '+ Create Department', 'department_management')],
        dropdowns: [dd('city', 'City', 'LeadCity'), dd('source', 'Source', 'LeadSource'), dd('type', 'Type', 'LeadType'), dd('priority', 'Priority', 'LeadPriority'), dd('status', 'Status', 'StatusItem'), dd('assignedTo', 'Assign To', 'User', true), dd('department', 'Department', 'Department', true)],
      },
      edit: {
        quickCreate: [qc('city', '+ Create City', 'lead_master'), qc('source', '+ Create Source', 'lead_master'), qc('type', '+ Create Type', 'lead_master'), qc('priority', '+ Create Priority', 'lead_master'), qc('status', '+ Create Status', 'status_management'), qc('department', '+ Create Department', 'department_management')],
        dropdowns: [dd('city', 'City', 'LeadCity'), dd('source', 'Source', 'LeadSource'), dd('type', 'Type', 'LeadType'), dd('priority', 'Priority', 'LeadPriority'), dd('status', 'Status', 'StatusItem'), dd('assignedTo', 'Assign To', 'User', true), dd('department', 'Department', 'Department', true)],
      },
      filters: { dropdowns: [dd('source', 'Source', 'LeadSource'), dd('type', 'Type', 'LeadType'), dd('city', 'City', 'LeadCity'), dd('priority', 'Priority', 'LeadPriority'), dd('assignedTo', 'Assigned To', 'User', true), dd('department', 'Department', 'Department', true)] },
    },
  },

  customers: {
    label: 'Customers', path: '/customers',
    columns: [col('Customer'), col('Email'), col('Phone'), col('Source'), col('Type'), col('Status'), col('Assigned To'), col('Department'), col('Active Status'), col('Created Date')],
    drawer: {
      fields: [
        row('Lead Ref'), row('Converted At'), row('Converted By'), row('First Name'), row('Last Name'), row('Email'), row('Phone'), row('Alternate Phone'), row('Company'),
        row('Source'), row('Type'), row('Status'), row('Description'), row('Address'), row('City'), row('State'), row('Country'), row('Zip Code'),
        row('Assigned To'), row('Department'), row('Linked User'), row('User Email'), row('User Status'), ...AUDIT_ROWS,
      ],
      extras: [
        { key: 'drawer.edit', label: 'Edit button in drawer', match: ['Edit'] },
        { key: 'drawer.delete', label: 'Delete button in drawer', match: ['Delete Customer', 'Delete'] },
      ],
    },
    forms: {
      create: {
        quickCreate: [qc('source', '+ Create Source', 'lead_master'), qc('type', '+ Create Type', 'lead_master'), qc('status', '+ Create Status', 'status_management'), qc('city', '+ Create City', 'lead_master'), qc('vehicle', 'Vehicles tab (the customer’s cars)', 'customers')],
        dropdowns: [dd('source', 'Source', 'LeadSource'), dd('type', 'Type', 'LeadType'), dd('status', 'Status', 'StatusItem'), dd('city', 'City', 'LeadCity'), dd('assignedTo', 'Assign To', 'User', true), dd('department', 'Department', 'Department', true)],
      },
      edit: {
        quickCreate: [qc('source', '+ Create Source', 'lead_master'), qc('type', '+ Create Type', 'lead_master'), qc('status', '+ Create Status', 'status_management'), qc('city', '+ Create City', 'lead_master'), qc('vehicle', 'Vehicles tab (the customer’s cars)', 'customers')],
        dropdowns: [dd('source', 'Source', 'LeadSource'), dd('type', 'Type', 'LeadType'), dd('status', 'Status', 'StatusItem'), dd('city', 'City', 'LeadCity'), dd('assignedTo', 'Assign To', 'User', true), dd('department', 'Department', 'Department', true)],
      },
      filters: { dropdowns: [dd('source', 'Source', 'LeadSource'), dd('type', 'Type', 'LeadType'), dd('city', 'City', 'LeadCity'), dd('status', 'Status', 'StatusItem'), dd('assignedTo', 'Assigned To', 'User', true), dd('department', 'Department', 'Department', true)] },
    },
  },

  // ── Inventory ───────────────────────────────────────────────────────────
  vehicles: {
    label: 'Vehicles', path: '/vehicles',
    columns: [col('VIN'), col('Vehicle'), col('Color'), col('Year'), col('Status'), col('Dispatch'), col('Condition'), col('Selling Price'), col('Warehouse')],
    drawer: { fields: [], extras: [] },
    forms: {
      create: {
        quickCreate: [qc('make', '+ Create Make', 'vehicle_master'), qc('model', '+ Create Model', 'vehicle_master'), qc('variant', '+ Create Variant', 'vehicle_master'), qc('color', '+ Create Colour', 'vehicle_master'), qc('condition', '+ Condition', 'vehicle_master'), qc('warehouse', '+ Create Warehouse', 'warehouses')],
        dropdowns: [dd('make', 'Brand / Make', 'VehicleMake'), dd('model', 'Model', 'VehicleModel'), dd('variant', 'Variant', 'VehicleVariant'), dd('color', 'Colour', 'VehicleColor'), dd('condition', 'Condition', 'static'), dd('warehouse', 'Warehouse', 'Warehouse')],
      },
      edit: {
        quickCreate: [qc('make', '+ Create Make', 'vehicle_master'), qc('model', '+ Create Model', 'vehicle_master'), qc('variant', '+ Create Variant', 'vehicle_master'), qc('color', '+ Create Colour', 'vehicle_master'), qc('condition', '+ Condition', 'vehicle_master'), qc('warehouse', '+ Create Warehouse', 'warehouses')],
        dropdowns: [dd('make', 'Brand / Make', 'VehicleMake'), dd('model', 'Model', 'VehicleModel'), dd('variant', 'Variant', 'VehicleVariant'), dd('color', 'Colour', 'VehicleColor'), dd('condition', 'Condition', 'static'), dd('warehouse', 'Warehouse', 'Warehouse')],
      },
      filters: { dropdowns: [dd('status', 'Status', 'static'), dd('make', 'Brand', 'VehicleMake'), dd('dispatch', 'Dispatch', 'static')] },
    },
  },

  parts: {
    label: 'Parts Inventory', path: '/parts',
    columns: [col('Part #'), col('Name'), col('Source'), col('Category'), col('Stock'), col('Status'), col('Purchase Price'), col('Selling Price')],
    drawer: { fields: [], extras: [] },
    forms: {
      create: {
        quickCreate: [qc('category', '+ Create Category', 'vehicle_master'), qc('supplier', '+ Create Supplier', 'vehicle_master'), qc('source_type', '+ Create Source Type', 'parts')],
        dropdowns: [dd('source_type', 'Source Type', 'PartSourceType'), dd('category', 'Category', 'PartCategory'), dd('supplier', 'Supplier', 'Supplier'), dd('unit', 'Unit', 'static')],
      },
      edit: {
        quickCreate: [qc('category', '+ Create Category', 'vehicle_master'), qc('supplier', '+ Create Supplier', 'vehicle_master'), qc('source_type', '+ Create Source Type', 'parts')],
        dropdowns: [dd('source_type', 'Source Type', 'PartSourceType'), dd('category', 'Category', 'PartCategory'), dd('supplier', 'Supplier', 'Supplier'), dd('unit', 'Unit', 'static')],
      },
      filters: { dropdowns: [dd('category', 'Category', 'PartCategory'), dd('stock', 'Stock', 'static')] },
    },
  },

  warehouses: {
    label: 'Warehouse Management', path: '/warehouses',
    columns: [col('Name'), col('Code'), col('Type'), col('Manager'), col('Location'), col('Status')],
    drawer: { fields: [], extras: [] },
    forms: {
      create: { quickCreate: [], dropdowns: [dd('type', 'Type', 'static'), dd('manager', 'Manager', 'User', true)] },
      edit: { quickCreate: [], dropdowns: [dd('type', 'Type', 'static'), dd('manager', 'Manager', 'User', true)] },
      filters: { dropdowns: [] },
    },
  },

  // ── Vehicle sales ───────────────────────────────────────────────────────
  quotations: quotationEntry('Vehicle Quotations', '/vehicle-sales/quotations', 'Vehicles'),
  bookings: {
    label: 'Vehicle Bookings', path: '/vehicle-sales/booking',
    columns: [col('Booking #'), col('Customer'), col('Vehicles', 'products'), col('Amount Paid'), col('Expected Date'), col('Service Charges'), col('Status')],
    drawer: salesDrawer(),
    forms: {
      create: salesDocumentForm([dd('priority', 'Priority', 'static')]),
      edit: salesDocumentForm([dd('priority', 'Priority', 'static')]),
      filters: salesFilters([dd('priority', 'Priority', 'static')]),
    },
  },
  sales_orders: {
    label: 'Vehicle Sales Orders', path: '/vehicle-sales/orders',
    columns: [col('Order #'), col('Date'), col('Customer'), col('Type'), col('Vehicles', 'products'), col('Total'), col('Paid'), col('Invoice'), col('Status')],
    drawer: salesDrawer(),
    forms: {
      create: salesDocumentForm([dd('sale_type', 'Sale type', 'static')]),
      edit: salesDocumentForm(),
      filters: salesFilters(),
    },
  },
  invoices: invoiceEntry('Vehicle Invoices', '/vehicle-sales/invoices', 'Vehicles'),
  vehicle_scan: {
    label: 'Vehicle Scan', path: '/vehicle-sales/barcode-scan',
    columns: [], drawer: { fields: [], extras: [] },
    forms: { create: { quickCreate: [CUSTOMER_QC], dropdowns: [CUSTOMER_PICK, PAYMENT_METHOD_PICK] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } },
  },

  // ── Parts sales ─────────────────────────────────────────────────────────
  part_quotations: quotationEntry('Parts Quotations', '/parts-sales/quotations', 'Parts'),
  part_bookings: {
    label: 'Parts Bookings', path: '/parts-sales/bookings',
    columns: [col('Booking #'), col('Customer'), col('Parts', 'products'), col('Amount Paid'), col('Expected Date'), col('Service Charges'), col('Status')],
    drawer: salesDrawer(),
    forms: {
      create: salesDocumentForm([dd('priority', 'Priority', 'static')]),
      edit: salesDocumentForm([dd('priority', 'Priority', 'static')]),
      filters: salesFilters([dd('priority', 'Priority', 'static')]),
    },
  },
  part_invoices: invoiceEntry('Parts Invoices', '/parts-sales/invoices', 'Parts'),
  part_scan: {
    label: 'Parts Scan', path: '/parts-sales/barcode-scan',
    columns: [], drawer: { fields: [], extras: [] },
    forms: { create: { quickCreate: [CUSTOMER_QC], dropdowns: [CUSTOMER_PICK, PAYMENT_METHOD_PICK] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } },
  },

  // ── Custom documents (module-gated) ─────────────────────────────────────
  custom_quotations: {
    ...quotationEntry('Custom Quotations', '/custom/quotations', 'Items'),
    columns: [col('Quote #'), col('Date'), col('Customer'), col('Items'), col('Total'), col('Service Charges'), col('Status')],
  },
  custom_bookings: {
    label: 'Custom Bookings', path: '/custom/bookings',
    columns: [col('Booking #'), col('Date'), col('Customer'), col('Items'), col('Total'), col('Amount Paid'), col('Expected Date'), col('Status')],
    drawer: salesDrawer(),
    forms: { create: salesDocumentForm(), edit: salesDocumentForm(), filters: salesFilters() },
  },
  custom_invoices: {
    ...invoiceEntry('Custom Invoices', '/custom/invoices', 'Items'),
    columns: [col('Invoice #'), col('Date'), col('Due Date'), col('Customer'), col('Items'), col('Total'), col('Paid'), col('Balance'), col('Payment Term'), col('Service Charges'), col('Status')],
  },

  // ── Service ─────────────────────────────────────────────────────────────
  services: {
    label: 'Services', path: '/service',
    columns: [col('JC #'), col('Customer'), col('Vehicle'), col('Received'), col('Labor'), col('Parts'), col('Total'), col('Invoice'), col('Status')],
    drawer: { fields: [row('Details'), row('Status'), row('Items'), row('Payment Summary')], extras: [] },
    forms: {
      create: {
        quickCreate: [CUSTOMER_QC, qc('warranty_type', '+ Create Warranty Type', 'service_master'), qc('service_package', '+ Create Service Package', 'service_master'), SERVICE_TYPE_QC, qc('labor_rate', '+ Create Labor Rate', 'service_master')],
        dropdowns: [CUSTOMER_PICK, dd('vehicle_brand', 'Vehicle brand / model / variant', 'VehicleMake'), dd('service_advisor', 'Service Advisor', 'User', true), dd('technician', 'Technician', 'User', true), dd('warranty', 'Warranty', 'WarrantyType'), dd('package', 'Service Package', 'ServicePackage'), dd('service_type', 'Service Type', 'ServiceType'), dd('labor_rate', 'Labor rate', 'LaborRate'), dd('part', 'Part', 'Part', true)],
      },
      edit: {
        quickCreate: [CUSTOMER_QC, qc('warranty_type', '+ Create Warranty Type', 'service_master'), qc('service_package', '+ Create Service Package', 'service_master'), SERVICE_TYPE_QC, qc('labor_rate', '+ Create Labor Rate', 'service_master')],
        dropdowns: [CUSTOMER_PICK, dd('service_advisor', 'Service Advisor', 'User', true), dd('technician', 'Technician', 'User', true), dd('warranty', 'Warranty', 'WarrantyType'), dd('package', 'Service Package', 'ServicePackage'), dd('service_type', 'Service Type', 'ServiceType'), dd('labor_rate', 'Labor rate', 'LaborRate'), dd('part', 'Part', 'Part', true)],
      },
      filters: { dropdowns: [dd('status', 'Status', 'static'), CUSTOMER_PICK, dd('technician', 'Technician', 'User', true)] },
    },
  },
  service_appointments: {
    label: 'Service Appointments', path: '/service/appointments',
    columns: [col('Appt #'), col('Customer'), col('Vehicle'), col('Service Type'), col('Date'), col('Time'), col('Status')],
    drawer: { fields: [row('Details'), row('Status'), row('Items')], extras: [] },
    forms: {
      create: {
        quickCreate: [CUSTOMER_QC, SERVICE_TYPE_QC],
        dropdowns: [CUSTOMER_PICK, dd('vehicle_brand', 'Vehicle brand / model / variant', 'VehicleMake'), dd('service_type', 'Service Type', 'ServiceType'), dd('service_advisor', 'Service Advisor', 'User', true)],
      },
      edit: {
        quickCreate: [CUSTOMER_QC, SERVICE_TYPE_QC],
        dropdowns: [CUSTOMER_PICK, dd('vehicle_brand', 'Vehicle brand / model / variant', 'VehicleMake'), dd('service_type', 'Service Type', 'ServiceType'), dd('service_advisor', 'Service Advisor', 'User', true)],
      },
      filters: { dropdowns: [dd('status', 'Status', 'static'), CUSTOMER_PICK] },
    },
  },

  // ── HR & Finance ────────────────────────────────────────────────────────
  employees: {
    label: 'Employees', path: '/hr/employees',
    columns: [col('Employee'), col('Email'), col('Department'), col('Designation'), col('Status')],
    drawer: {
      fields: [row('Employee Code'), row('Status'), row('Department'), row('Designation'), row('Role'), row('Joining Date'), row('Email'), row('Phone'), row('CNIC'), row('Salary')],
      extras: [],
    },
    forms: {
      create: { quickCreate: [qc('department', '+ Create Department', 'department_management')], dropdowns: [dd('department', 'Department', 'Department', true), dd('role', 'Role', 'Role')] },
      edit: { quickCreate: [qc('department', '+ Create Department', 'department_management')], dropdowns: [dd('department', 'Department', 'Department', true), dd('role', 'Role', 'Role')] },
      filters: { dropdowns: [] },
    },
  },
  leaves: {
    label: 'Leaves', path: '/hr/leaves',
    columns: [col('Employee'), col('Leave Type'), col('Start'), col('End'), col('Days'), col('Status')],
    drawer: { fields: [row('Employee'), row('Status'), row('Leave Type'), row('Days'), row('Start Date'), row('End Date'), row('Reason'), row('Approved By')], extras: [] },
    forms: {
      create: { quickCreate: [], dropdowns: [dd('employee', 'Employee', 'Employee', true), dd('leave_type', 'Leave Type', 'static')] },
      edit: { quickCreate: [], dropdowns: [dd('employee', 'Employee', 'Employee', true), dd('leave_type', 'Leave Type', 'static')] },
      filters: { dropdowns: [] },
    },
  },
  expenses: {
    label: 'Expenses', path: '/hr/expenses',
    columns: [col('Expense #'), col('Date'), col('Category'), col('Account'), col('Amount'), col('Vendor'), col('Status')],
    drawer: { fields: [row('Expense Number'), row('Status'), row('Category'), row('Account'), row('Amount'), row('Expense Date'), row('Vendor'), row('Description'), row('Employee')], extras: [] },
    forms: {
      create: { quickCreate: [qc('expense_category', '+ Create Category', 'expenses'), qc('account', '+ Create Account', 'accounts')], dropdowns: [dd('category', 'Category', 'ExpenseCategory'), dd('account', 'Paid from account', 'Account'), dd('employee', 'Employee', 'Employee', true)] },
      edit: { quickCreate: [qc('expense_category', '+ Create Category', 'expenses'), qc('account', '+ Create Account', 'accounts')], dropdowns: [dd('category', 'Category', 'ExpenseCategory'), dd('account', 'Paid from account', 'Account'), dd('employee', 'Employee', 'Employee', true)] },
      filters: { dropdowns: [] },
    },
  },
  ledger: {
    label: 'Ledger', path: '/hr/ledger',
    columns: [col('Date'), col('Reference'), col('Account'), col('Description'), col('Debit'), col('Credit'), col('Balance')],
    drawer: { fields: [row('Date'), row('Reference'), row('Account'), row('Debit'), row('Credit'), row('Description')], extras: [] },
    forms: {
      create: { quickCreate: [], dropdowns: [dd('account', 'Account', 'Account')] },
      edit: { quickCreate: [], dropdowns: [] },
      filters: { dropdowns: [dd('account', 'Account', 'Account')] },
    },
  },
  payroll: {
    label: 'Payroll', path: '/hr/payroll',
    columns: [col('Label'), col('From'), col('To'), col('Status'), col('Lines'), col('Employee'), col('Gross'), col('Deductions'), col('Advance'), col('Net'), col('Paid'), col('Remaining')],
    drawer: { fields: [], extras: [] },
    forms: {
      create: { quickCreate: [], dropdowns: [dd('employee', 'Employee', 'Employee', true), dd('account', 'Paid from account', 'Account')] },
      edit: { quickCreate: [], dropdowns: [dd('employee', 'Employee', 'Employee', true), dd('account', 'Paid from account', 'Account')] },
      filters: { dropdowns: [dd('employee', 'Employee', 'Employee', true)] },
    },
  },
  accounts: {
    label: 'Accounts & Petty Cash', path: '/finance/accounts',
    columns: [col('Account'), col('Type'), col('Balance'), col('Limit'), col('Status'), col('Transfer #'), col('From'), col('To'), col('Amount'), col('Date'), col('Payable #'), col('Vendor'), col('Due Date'), col('Outstanding'), col('Customer'), col('Invoice #'), col('Opening'), col('In'), col('Out'), col('Closing')],
    drawer: { fields: [], extras: [] },
    forms: {
      create: { quickCreate: [], dropdowns: [dd('from_account', 'From account', 'Account'), dd('to_account', 'To account', 'Account'), dd('vendor', 'Vendor', 'Supplier'), dd('customer', 'Customer', 'Customer', true)] },
      edit: { quickCreate: [], dropdowns: [dd('from_account', 'From account', 'Account'), dd('to_account', 'To account', 'Account')] },
      filters: { dropdowns: [dd('account', 'Account', 'Account'), dd('status', 'Status', 'static')] },
    },
  },

  // ── Gate passes ─────────────────────────────────────────────────────────
  gatepass_in: {
    label: 'Gate Pass In', path: '/gatepass/in',
    columns: [col('Gate Pass #'), col('Type'), col('Date'), col('R/O #'), col('C/O #'), col('Invoice #'), col('Transporter / Customer'), col('Vehicle No'), col('Engine No'), col('PBO'), col('Items'), col('Status')],
    drawer: { fields: [row('Details'), row('Items'), row('Attachments'), row('Linked Documents')], extras: [{ key: 'drawer.download_pdf', label: 'Download PDF button in drawer', match: ['Download PDF'] }] },
    forms: {
      create: { quickCreate: [CUSTOMER_QC, PART_QC], dropdowns: [dd('entry_type', 'Entry type', 'static'), CUSTOMER_PICK, dd('part', 'Part (add to inventory)', 'Part', true)] },
      edit: { quickCreate: [CUSTOMER_QC, PART_QC], dropdowns: [dd('entry_type', 'Entry type', 'static'), CUSTOMER_PICK, dd('part', 'Part (add to inventory)', 'Part', true)] },
      filters: { dropdowns: [dd('entry_type', 'Entry type', 'static'), dd('status', 'Status', 'static')] },
    },
  },
  gatepass_out: {
    label: 'Gate Pass Out', path: '/gatepass/out',
    columns: [col('Gate Pass #'), col('Type'), col('Date'), col('Against Entry'), col('Invoice #'), col('GRN #'), col('Transporter / Customer'), col('Vehicle No'), col('Items'), col('Status')],
    drawer: { fields: [row('Details'), row('Items'), row('Linked Documents')], extras: [{ key: 'drawer.download_pdf', label: 'Download PDF button in drawer', match: ['Download PDF'] }] },
    forms: {
      create: { quickCreate: [], dropdowns: [dd('entry', 'Entry (gate pass in)', 'GatePass'), dd('invoice', 'Invoice / estimate', 'Invoice|PartInvoice|CustomInvoice')] },
      edit: { quickCreate: [], dropdowns: [] },
      filters: { dropdowns: [dd('entry_type', 'Entry type', 'static'), dd('status', 'Status', 'static')] },
    },
  },
  gatepass_verify: {
    label: 'Gate Pass Verify', path: '/gatepass/verify',
    columns: [], drawer: { fields: [row('Details'), row('Items'), row('Linked Documents')], extras: [] },
    forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } },
  },

  // ── Logistics ───────────────────────────────────────────────────────────
  dispatch: {
    label: 'Dispatch Report', path: '/dispatch',
    columns: [col('Dispatch #'), col('Order #'), col('Booking #'), col('Customer'), col('Salesman'), col('Chassis / VIN'), col('Dispatch Date'), col('Transport'), col('Ship From → To', 'ship_from_to'), col('Invoice #'), col('Status')],
    drawer: { fields: [row('Details'), row('Status'), row('Items'), row('Payment Summary')], extras: [] },
    forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [dd('status', 'Status', 'static')] } },
  },

  // ── Master data & administration ────────────────────────────────────────
  master_data: { label: 'Master Data', path: '/masterdata', columns: [], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } } },
  vehicle_master: {
    label: 'Vehicle Master Data', path: '/vehicle-master',
    columns: [col('Name'), col('Code'), col('Make'), col('Model'), col('Category'), col('Type'), col('Contact'), col('Status')],
    drawer: { fields: [], extras: [] },
    forms: {
      create: { quickCreate: [], dropdowns: [dd('make', 'Make', 'VehicleMake'), dd('model', 'Model', 'VehicleModel'), dd('parent_category', 'Parent Category', 'PartCategory'), dd('supplier_type', 'Supplier Type', 'static')] },
      edit: { quickCreate: [], dropdowns: [dd('make', 'Make', 'VehicleMake'), dd('model', 'Model', 'VehicleModel'), dd('parent_category', 'Parent Category', 'PartCategory'), dd('supplier_type', 'Supplier Type', 'static')] },
      filters: { dropdowns: [] },
    },
  },
  lead_master: { label: 'Lead Master Data', path: '/lead-master', columns: [col('Name'), col('Code'), col('Sort Order'), col('Status')], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } } },
  sales_master: { label: 'Sales Master Data', path: '/sales-master', columns: [col('Name'), col('Code'), col('Description'), col('Status')], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } } },
  service_master: {
    label: 'Service Master Data', path: '/service-master',
    columns: [col('Name'), col('Code'), col('Base Price'), col('Rate'), col('Duration'), col('Warranty'), col('Status')],
    drawer: { fields: [], extras: [] },
    forms: { create: { quickCreate: [], dropdowns: [dd('warranty', 'Warranty', 'WarrantyType')] }, edit: { quickCreate: [], dropdowns: [dd('warranty', 'Warranty', 'WarrantyType')] }, filters: { dropdowns: [] } },
  },
  payment_methods: {
    label: 'Payment Methods', path: '/payment-methods',
    columns: [col('Name'), col('Code'), col('Type'), col('Account'), col('Description'), col('Sort Order'), col('Status')],
    drawer: { fields: [], extras: [] },
    forms: { create: { quickCreate: [], dropdowns: [dd('type', 'Type', 'static'), dd('account', 'Linked account', 'Account')] }, edit: { quickCreate: [], dropdowns: [dd('type', 'Type', 'static'), dd('account', 'Linked account', 'Account')] }, filters: { dropdowns: [] } },
  },
  status_management: { label: 'Option Management', path: '/admin/statuses', columns: [col('Name'), col('Key'), col('Items'), col('Status')], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [dd('collection', 'Collection', 'StatusCollection')] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } } },
  user_management: {
    label: 'User Management', path: '/admin/users',
    columns: [col('User'), col('Email'), col('Role'), col('Department'), col('Status'), col('Last Login')],
    drawer: { fields: [], extras: [] },
    forms: {
      create: { quickCreate: [], dropdowns: [dd('role', 'Role', 'Role'), dd('department', 'Department', 'Department', true)] },
      edit: { quickCreate: [], dropdowns: [dd('role', 'Role', 'Role'), dd('department', 'Department', 'Department', true)] },
      filters: { dropdowns: [dd('role', 'Role', 'Role')] },
    },
  },
  department_management: {
    label: 'Department Management', path: '/admin/departments',
    columns: [col('Department'), col('Code'), col('Manager'), col('Staff'), col('Status')],
    drawer: { fields: [row('Details'), row('Staff')], extras: [{ key: 'drawer.add_staff', label: 'Add Staff button in drawer', match: ['Add Staff'] }] },
    forms: {
      create: { quickCreate: [], dropdowns: [dd('parent', 'Parent Department', 'Department', true), dd('manager', 'Manager', 'User', true)] },
      edit: { quickCreate: [], dropdowns: [dd('parent', 'Parent Department', 'Department', true), dd('manager', 'Manager', 'User', true)] },
      filters: { dropdowns: [] },
    },
  },
  role_management: { label: 'Role Management', path: '/admin/roles', columns: [col('Role'), col('Description'), col('Users'), col('Status')], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } } },
  settings: {
    label: 'ERP Settings', path: '/settings',
    columns: [col('Name'), col('Code'), col('Type'), col('Rate'), col('Status')],
    drawer: { fields: [], extras: [] },
    forms: {
      create: { quickCreate: [], dropdowns: [dd('company', 'Company', 'Company'), dd('branch_type', 'Branch Type', 'static'), dd('manager', 'Manager', 'User'), dd('currency', 'Currency', 'static'), dd('tax_type', 'Tax Type', 'static')] },
      edit: { quickCreate: [], dropdowns: [dd('company', 'Company', 'Company'), dd('branch_type', 'Branch Type', 'static'), dd('manager', 'Manager', 'User')] },
      filters: { dropdowns: [] },
    },
  },
  server_management: { label: 'Server Management', path: '/server-management', columns: [], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } } },
  data_import: { label: 'Data Import', path: '/data-import', columns: [col('File'), col('Module'), col('Status'), col('Uploaded By'), col('Date')], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } } },

  // ── Communication, reporting, system ────────────────────────────────────
  reports: { label: 'Reports', path: '/reports', columns: [], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [CUSTOMER_PICK, dd('employee', 'Employee', 'Employee')] } } },
  email_templates: { label: 'Email Templates', path: '/email', columns: [col('Name'), col('Category'), col('Status'), col('Updated')], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [dd('category', 'Category', 'static')] }, edit: { quickCreate: [], dropdowns: [dd('category', 'Category', 'static')] }, filters: { dropdowns: [] } } },
  pdf_management: { label: 'PDF Management', path: '/pdf-management', columns: [col('Name'), col('Document Type'), col('Status'), col('Updated')], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [dd('document_type', 'Document type', 'static')] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } } },
  logs: { label: 'Logs', path: '/logs', columns: [col('Time'), col('User'), col('Action'), col('Module'), col('Status'), col('IP')], drawer: { fields: [row('Request'), row('Response'), row('User'), row('Meta')], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [dd('user', 'Logs Of', 'User'), dd('role', 'Role', 'Role'), dd('status_code', 'Status Code', 'static')] } } },
  dashboard: { label: 'Dashboard', path: '/dashboard', columns: [], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } } },
  search: { label: 'Search', path: '/search', columns: [], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } } },
  profile: { label: 'Profile', path: '/profile', columns: [], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } } },
  notification_settings: { label: 'Notification Settings', path: '/notification-settings', columns: [], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } } },
};

/** The forms that can be configured, in display order. */
const FORM_KEYS = ['create', 'edit', 'filters'];

/** How a dropdown may be scoped, in display order. */
const DROPDOWN_MODES = ['all', 'own', 'selected_roles', 'selected_users', 'none'];
const DROPDOWN_MODE_LABELS = {
  all: 'All data',
  own: 'Own data only',
  selected_roles: 'Data of selected roles',
  selected_users: 'Data of selected users',
  none: 'Hidden',
};

/** One page's entry, or an empty shell for a page this build does not know. */
const catalogFor = (pageKey) => {
  const direct = PAGE_CATALOG[pageKey];
  if (direct) return direct;
  const { keysForPage } = require('../utils/pageRegistry');
  for (const key of keysForPage(pageKey)) {
    if (PAGE_CATALOG[key]) return PAGE_CATALOG[key];
  }
  return { label: pageKey, path: '', columns: [], drawer: { fields: [], extras: [] }, forms: { create: { quickCreate: [], dropdowns: [] }, edit: { quickCreate: [], dropdowns: [] }, filters: { dropdowns: [] } } };
};

/** Every column key of a page. */
const pageColumnKeys = (pageKey) => catalogFor(pageKey).columns.map((column) => column.key);
/** Every drawer field key of a page. */
const pageDrawerFieldKeys = (pageKey) => catalogFor(pageKey).drawer.fields.map((field) => field.key);
/** Every drawer extra key of a page. */
const pageDrawerExtraKeys = (pageKey) => catalogFor(pageKey).drawer.extras.map((extra) => extra.key);
/** Quick-create keys of one form of a page. */
const pageQuickCreateKeys = (pageKey, form) => (catalogFor(pageKey).forms[form]?.quickCreate || []).map((item) => item.key);
/** Dropdown definitions of one form of a page. */
const pageDropdowns = (pageKey, form) => catalogFor(pageKey).forms[form]?.dropdowns || [];

/**
 * Every screen that offers a "+ Create X" shortcut owned by `owner`.
 *
 * The catalog already records, for each form, which master-data page owns each
 * shortcut. Read the other way round it answers the question a route guard has
 * to ask: "this POST raises a lead source — which pages offer that from inside
 * one of their forms?" Holding one of those pages, with Create on it and the
 * shortcut itself still ticked, is what lets the request through without the
 * whole Lead Master Data page having to be granted as well.
 *
 * Returns `{ page, key, form }` rows, one per form the shortcut appears on.
 */
const quickCreateHosts = (owner, keys = null) => {
  const wanted = keys ? new Set((Array.isArray(keys) ? keys : [keys]).map(String)) : null;
  const hosts = [];
  for (const [pageKey, entry] of Object.entries(PAGE_CATALOG)) {
    for (const form of ['create', 'edit']) {
      for (const item of entry?.forms?.[form]?.quickCreate || []) {
        if (item.owner !== owner) continue;
        if (wanted && !wanted.has(String(item.key))) continue;
        hosts.push({ page: pageKey, key: item.key, form });
      }
    }
  }
  return hosts;
};

/**
 * The catalog shaped for the browser: the same data with the internal
 * `match` lists kept (the view gate needs them) and nothing else added.
 */
const catalogForClient = () => Object.fromEntries(
  Object.entries(PAGE_CATALOG).map(([pageKey, entry]) => [pageKey, {
    label: entry.label,
    path: entry.path,
    columns: entry.columns,
    drawer: entry.drawer,
    forms: entry.forms,
  }]),
);

module.exports = {
  PAGE_CATALOG,
  FORM_KEYS,
  DROPDOWN_MODES,
  DROPDOWN_MODE_LABELS,
  slug,
  catalogFor,
  catalogForClient,
  pageColumnKeys,
  pageDrawerFieldKeys,
  pageDrawerExtraKeys,
  pageQuickCreateKeys,
  pageDropdowns,
  quickCreateHosts,
};
