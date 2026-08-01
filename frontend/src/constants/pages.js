const pages = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard', module: 'dashboard', icon: 'LayoutDashboard', group: 'Main', isCore: true, isActive: true },
  { key: 'leads', label: 'Leads', path: '/leads', module: 'crm', icon: 'Users', group: 'CRM', isCore: false, isActive: true },
  { key: 'customers', label: 'Customers', path: '/customers', module: 'crm', icon: 'Contact', group: 'CRM', isCore: false, isActive: true },
  { key: 'vehicles', label: 'Vehicles', path: '/vehicles', module: 'inventory', icon: 'Car', group: 'Inventory', isCore: false, isActive: true },
  { key: 'vehicle_master', label: 'Vehicle Master Data', path: '/vehicle-master', module: 'vehicle-master', icon: 'CarFront', group: 'Master Data', isCore: false, isActive: true },
  { key: 'parts', label: 'Parts Inventory', path: '/parts', module: 'parts', icon: 'Cog', group: 'Inventory', isCore: false, isActive: true },
  { key: 'barcode_scan', label: 'Barcode Scan', path: '/barcode-scan', module: 'barcode-scan', icon: 'ScanLine', group: 'Inventory', isCore: false, isActive: true },
  { key: 'warehouses', label: 'Warehouse Management', path: '/warehouses', module: 'warehouses', icon: 'Warehouse', group: 'Master Data', isCore: false, isActive: true },
  { key: 'services', label: 'Services', path: '/service/appointments', module: 'service', icon: 'Wrench', group: 'Service', isCore: false, isActive: true },
  { key: 'service_master', label: 'Service Master Data', path: '/service-master', module: 'service-master', icon: 'Settings', group: 'Master Data', isCore: false, isActive: true },
  { key: 'reports', label: 'Reports', path: '/reports', module: 'reports', icon: 'BarChart3', group: 'Reports', isCore: false, isActive: true },
  { key: 'employees', label: 'Employees', path: '/hr/employees', module: 'hr', icon: 'UserRound', group: 'HR & Finance', isCore: false, isActive: true },
  { key: 'leaves', label: 'Leaves', path: '/hr/leaves', module: 'leaves', icon: 'CalendarDays', group: 'HR & Finance', isCore: false, isActive: true },
  { key: 'expenses', label: 'Expenses', path: '/hr/expenses', module: 'expenses', icon: 'WalletCards', group: 'HR & Finance', isCore: false, isActive: true },
  { key: 'ledger', label: 'Ledger', path: '/hr/ledger', module: 'ledger', icon: 'BookOpen', group: 'HR & Finance', isCore: false, isActive: true },
  { key: 'payment_methods', label: 'Payment Methods', path: '/payment-methods', module: 'payment-methods', icon: 'CreditCard', group: 'ERP Settings', isCore: false, isActive: true },
  { key: 'settings', label: 'Settings', path: '/settings', module: 'settings', icon: 'Settings', group: 'ERP Settings', isCore: false, isActive: true },
  { key: 'erp_settings', label: 'ERP Settings', path: '/settings', module: 'erp-settings', icon: 'SlidersHorizontal', group: 'ERP Settings', isCore: false, isActive: true },
  { key: 'user_management', label: 'User Management', path: '/admin/users', module: 'users', icon: 'UsersRound', group: 'Master Data', isCore: false, isActive: true },
  { key: 'department_management', label: 'Department Management', path: '/admin/departments', module: 'departments', icon: 'Building2', group: 'Master Data', isCore: false, isActive: true },
  { key: 'status_management', label: 'Option Management', path: '/admin/statuses', module: 'statuses', icon: 'ListChecks', group: 'Master Data', isCore: false, isActive: true },
  { key: 'lead_master', label: 'Lead Master Data', path: '/lead-master', module: 'lead-master', icon: 'ListTree', group: 'Master Data', isCore: false, isActive: true },
  { key: 'sales_master', label: 'Sales Master Data', path: '/sales-master', module: 'sales-master', icon: 'PanelTop', group: 'Master Data', isCore: false, isActive: true },
  { key: 'profile', label: 'Profile', path: '/profile', module: 'profile', icon: 'UserCircle', group: 'Account', isCore: false, isActive: true },
  { key: 'data_import', label: 'Data Import', path: '/data-import', module: 'uploader', icon: 'UploadCloud', group: 'Uploader', isCore: false, isActive: true },
  { key: 'dispatch', label: 'Dispatch Report', path: '/dispatch', module: 'dispatch', icon: 'Truck', group: 'Sales', isCore: false, isActive: true },
  { key: 'server_management', label: 'Server Management', path: '/server-management', module: 'server-management', icon: 'ServerCog', group: 'System', isCore: true, isActive: true },
  { key: 'email_templates', label: 'Email Templates', path: '/email', module: 'email', icon: 'Mail', group: 'Communication', isCore: false, isActive: true }
  ,{ key: 'pdf_management', label: 'PDF Management', path: '/pdf-management', module: 'pdf', icon: 'FileDown', group: 'Communication', isCore: false, isActive: true }
];

export default pages;
