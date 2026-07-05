-- AMSERP starter schema generated from uploaded project references
-- MariaDB 10.4 compatible fixed version: replaced unsupported JSON_OBJECTAGG()
-- Single import file: schema + basic roles/master seeds + supplier procedures.
-- Super admin is NOT created in this file.
-- backend/database/setup_auth_data.sql is not required separately because roles are already seeded below.
-- root supplier_management_live.sql is merged at the end, so it is not required separately.
DROP DATABASE IF EXISTS ams_db;
CREATE DATABASE ams_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ams_db;
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE roles (
 id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) UNIQUE NOT NULL, description TEXT, is_active BOOLEAN DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE permission_modules (
 id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL, display_name VARCHAR(150), description TEXT, sort_order INT DEFAULT 0, is_active BOOLEAN DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE permissions (
 id INT AUTO_INCREMENT PRIMARY KEY, module VARCHAR(100) NOT NULL, action VARCHAR(50) NOT NULL, name VARCHAR(150), description TEXT, module_id INT NULL, is_active BOOLEAN DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_perm(module, action)
);
CREATE TABLE role_permissions (role_id INT NOT NULL, permission_id INT NOT NULL, PRIMARY KEY(role_id,permission_id));
CREATE TABLE users (
 id INT AUTO_INCREMENT PRIMARY KEY, uuid CHAR(36) UNIQUE, email VARCHAR(255) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL,
 first_name VARCHAR(100), last_name VARCHAR(100), phone VARCHAR(30), role_id INT DEFAULT 9, department_id INT NULL,
 avatar VARCHAR(255), designation VARCHAR(100), is_active BOOLEAN DEFAULT TRUE, last_login DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP, INDEX(role_id), INDEX(email)
);
CREATE TABLE user_sessions (
 id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, token TEXT NOT NULL, ip_address VARCHAR(100), user_agent TEXT, expires_at DATETIME,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX(user_id)
);
CREATE TABLE user_preferences (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT UNIQUE, preferences JSON, theme VARCHAR(30), language VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE departments (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL, code VARCHAR(50), description TEXT, parent_id INT NULL, manager_id INT NULL, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE user_departments (user_id INT NOT NULL, department_id INT NOT NULL, PRIMARY KEY(user_id,department_id));
CREATE TABLE user_activity_logs (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NULL, action VARCHAR(100), module VARCHAR(100), entity_type VARCHAR(100), entity_id INT NULL, details JSON, ip_address VARCHAR(100), user_agent TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE activity_logs LIKE user_activity_logs;
CREATE TABLE system_logs (id INT AUTO_INCREMENT PRIMARY KEY, level VARCHAR(30), message TEXT, meta JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE customers (
 id INT AUTO_INCREMENT PRIMARY KEY, customer_code VARCHAR(50) UNIQUE, name VARCHAR(255), first_name VARCHAR(100), last_name VARCHAR(100), email VARCHAR(255), phone VARCHAR(30), alternate_phone VARCHAR(30), cnic VARCHAR(30), type VARCHAR(50) DEFAULT 'individual', address TEXT, city VARCHAR(100), country VARCHAR(100) DEFAULT 'Pakistan', is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE lead_sources (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) UNIQUE, description TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE leads (
 id INT AUTO_INCREMENT PRIMARY KEY, lead_code VARCHAR(50) UNIQUE, customer_id INT NULL, source_id INT NULL, assigned_to INT NULL, name VARCHAR(255), customer_name VARCHAR(255), email VARCHAR(255), phone VARCHAR(30), city VARCHAR(100), status VARCHAR(50) DEFAULT 'new', priority VARCHAR(50) DEFAULT 'medium', interest VARCHAR(255), notes TEXT, next_follow_up DATETIME NULL, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE leads_audit_log (id INT AUTO_INCREMENT PRIMARY KEY, lead_id INT, user_id INT, action VARCHAR(100), old_data JSON, new_data JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE vehicle_brands (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, code VARCHAR(30), logo_url VARCHAR(255), description TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE vehicle_makes (id INT AUTO_INCREMENT PRIMARY KEY, brand_id INT NULL, name VARCHAR(100) NOT NULL, code VARCHAR(30), country VARCHAR(100), is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE vehicle_models (id INT AUTO_INCREMENT PRIMARY KEY, make_id INT, name VARCHAR(100) NOT NULL, code VARCHAR(30), year_from INT NULL, year_to INT NULL, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE vehicle_variants (id INT AUTO_INCREMENT PRIMARY KEY, model_id INT, name VARCHAR(150) NOT NULL, code VARCHAR(30), engine_type VARCHAR(100), transmission VARCHAR(100), fuel_type VARCHAR(100), price DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE vehicle_colors (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, code VARCHAR(30), hex_code VARCHAR(20), is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE warehouses (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150), code VARCHAR(50), type VARCHAR(50), location VARCHAR(255), address TEXT, city VARCHAR(100), manager_id INT NULL, capacity INT DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE vehicles (
 id INT AUTO_INCREMENT PRIMARY KEY, vehicle_code VARCHAR(50) UNIQUE, vin VARCHAR(100), chassis_number VARCHAR(100), engine_number VARCHAR(100), registration_number VARCHAR(100), make_id INT, model_id INT, variant_id INT, color_id INT, warehouse_id INT NULL, year INT, purchase_price DECIMAL(15,2) DEFAULT 0, sale_price DECIMAL(15,2) DEFAULT 0, status VARCHAR(50) DEFAULT 'available', allocated_to_order_id INT NULL, mileage INT DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE vehicle_audit_log (id INT AUTO_INCREMENT PRIMARY KEY, vehicle_id INT, user_id INT, action VARCHAR(100), old_data JSON, new_data JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE suppliers (
 id INT AUTO_INCREMENT PRIMARY KEY, supplier_code VARCHAR(20) UNIQUE, name VARCHAR(255) NOT NULL, type ENUM('oem','distributor','local_vendor') DEFAULT 'local_vendor', contact_person VARCHAR(100), email VARCHAR(255), phone VARCHAR(30), address TEXT, city VARCHAR(100), country VARCHAR(100), tax_number VARCHAR(50), payment_terms VARCHAR(100), credit_limit DECIMAL(15,2) DEFAULT 0, outstanding_balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE part_categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL, code VARCHAR(50), description TEXT, parent_id INT NULL, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE parts (
 id INT AUTO_INCREMENT PRIMARY KEY, part_code VARCHAR(50) UNIQUE, sku VARCHAR(100), name VARCHAR(255), description TEXT, category_id INT NULL, supplier_id INT NULL, warehouse_id INT NULL, brand VARCHAR(100), unit VARCHAR(50) DEFAULT 'pcs', cost_price DECIMAL(15,2) DEFAULT 0, selling_price DECIMAL(15,2) DEFAULT 0, quantity INT DEFAULT 0, current_stock INT DEFAULT 0, min_stock INT DEFAULT 0, reorder_level INT DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE stock_movements (id INT AUTO_INCREMENT PRIMARY KEY, item_type VARCHAR(50), item_id INT, warehouse_id INT, movement_type VARCHAR(50), quantity INT, reference_type VARCHAR(100), reference_id INT, notes TEXT, created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE quotations (id INT AUTO_INCREMENT PRIMARY KEY, quotation_number VARCHAR(50) UNIQUE, customer_id INT, lead_id INT NULL, vehicle_id INT NULL, status VARCHAR(50) DEFAULT 'draft', total_amount DECIMAL(15,2) DEFAULT 0, valid_until DATE NULL, notes TEXT, created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE bookings (id INT AUTO_INCREMENT PRIMARY KEY, booking_number VARCHAR(50) UNIQUE, quotation_id INT NULL, customer_id INT, vehicle_id INT NULL, status VARCHAR(50) DEFAULT 'pending', booking_amount DECIMAL(15,2) DEFAULT 0, total_amount DECIMAL(15,2) DEFAULT 0, booking_date DATE NULL, delivery_date DATE NULL, created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE sales_orders (id INT AUTO_INCREMENT PRIMARY KEY, order_number VARCHAR(50) UNIQUE, booking_id INT NULL, quotation_id INT NULL, customer_id INT, vehicle_id INT NULL, status VARCHAR(50) DEFAULT 'draft', subtotal DECIMAL(15,2) DEFAULT 0, tax_amount DECIMAL(15,2) DEFAULT 0, discount_amount DECIMAL(15,2) DEFAULT 0, total_amount DECIMAL(15,2) DEFAULT 0, order_date DATE NULL, delivery_date DATE NULL, created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE sales_order_items (id INT AUTO_INCREMENT PRIMARY KEY, sales_order_id INT, item_type VARCHAR(50), item_id INT, description TEXT, quantity INT DEFAULT 1, unit_price DECIMAL(15,2) DEFAULT 0, total_price DECIMAL(15,2) DEFAULT 0);
CREATE TABLE sales_order_audit (id INT AUTO_INCREMENT PRIMARY KEY, sales_order_id INT, user_id INT, action VARCHAR(100), old_data JSON, new_data JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE invoices (id INT AUTO_INCREMENT PRIMARY KEY, invoice_number VARCHAR(50) UNIQUE, sales_order_id INT NULL, customer_id INT, status VARCHAR(50) DEFAULT 'draft', invoice_date DATE NULL, due_date DATE NULL, subtotal DECIMAL(15,2) DEFAULT 0, tax_amount DECIMAL(15,2) DEFAULT 0, discount_amount DECIMAL(15,2) DEFAULT 0, total_amount DECIMAL(15,2) DEFAULT 0, paid_amount DECIMAL(15,2) DEFAULT 0, balance_amount DECIMAL(15,2) DEFAULT 0, created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE invoice_items (id INT AUTO_INCREMENT PRIMARY KEY, invoice_id INT, item_type VARCHAR(50), item_id INT, description TEXT, quantity INT DEFAULT 1, unit_price DECIMAL(15,2) DEFAULT 0, total_price DECIMAL(15,2) DEFAULT 0);
CREATE TABLE payment_methods (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), code VARCHAR(50), type VARCHAR(50), is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE payments (id INT AUTO_INCREMENT PRIMARY KEY, payment_number VARCHAR(50) UNIQUE, invoice_id INT NULL, customer_id INT NULL, payment_method_id INT NULL, amount DECIMAL(15,2) DEFAULT 0, payment_date DATE NULL, reference_number VARCHAR(100), notes TEXT, status VARCHAR(50) DEFAULT 'completed', created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE payment_transactions (id INT AUTO_INCREMENT PRIMARY KEY, payment_id INT, transaction_id VARCHAR(100), status VARCHAR(50), amount DECIMAL(15,2), gateway_response JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE service_categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150), description TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE service_types (id INT AUTO_INCREMENT PRIMARY KEY, category_id INT NULL, name VARCHAR(150), code VARCHAR(50), description TEXT, estimated_hours DECIMAL(8,2) DEFAULT 0, base_price DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE service_packages (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150), code VARCHAR(50), description TEXT, price DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE service_package_items (id INT AUTO_INCREMENT PRIMARY KEY, package_id INT, service_type_id INT NULL, part_id INT NULL, quantity INT DEFAULT 1);
CREATE TABLE labor_rates (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150), rate_per_hour DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE warranty_types (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150), duration_months INT DEFAULT 0, description TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE service_appointments (id INT AUTO_INCREMENT PRIMARY KEY, appointment_number VARCHAR(50) UNIQUE, customer_id INT, vehicle_id INT NULL, service_type_id INT NULL, appointment_date DATETIME, status VARCHAR(50) DEFAULT 'scheduled', notes TEXT, created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE job_cards (id INT AUTO_INCREMENT PRIMARY KEY, job_card_number VARCHAR(50) UNIQUE, appointment_id INT NULL, customer_id INT, vehicle_id INT NULL, status VARCHAR(50) DEFAULT 'open', odometer INT DEFAULT 0, complaint TEXT, diagnosis TEXT, total_amount DECIMAL(15,2) DEFAULT 0, created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE job_card_services (id INT AUTO_INCREMENT PRIMARY KEY, job_card_id INT, service_type_id INT, description TEXT, labor_hours DECIMAL(8,2) DEFAULT 0, rate DECIMAL(15,2) DEFAULT 0, amount DECIMAL(15,2) DEFAULT 0);
CREATE TABLE job_card_parts (id INT AUTO_INCREMENT PRIMARY KEY, job_card_id INT, part_id INT, quantity INT DEFAULT 1, unit_price DECIMAL(15,2) DEFAULT 0, amount DECIMAL(15,2) DEFAULT 0);

CREATE TABLE employees (id INT AUTO_INCREMENT PRIMARY KEY, employee_code VARCHAR(50) UNIQUE, user_id INT NULL, first_name VARCHAR(100), last_name VARCHAR(100), email VARCHAR(255), phone VARCHAR(30), cnic VARCHAR(30), department_id INT NULL, role_id INT NULL, designation VARCHAR(100), joining_date DATE NULL, salary DECIMAL(15,2) DEFAULT 0, status VARCHAR(50) DEFAULT 'active', is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE employee_documents (id INT AUTO_INCREMENT PRIMARY KEY, employee_id INT, document_type VARCHAR(100), file_name VARCHAR(255), file_path VARCHAR(255), uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE leave_types (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), code VARCHAR(50), annual_quota INT DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE leave_balances (id INT AUTO_INCREMENT PRIMARY KEY, employee_id INT, leave_type_id INT, year INT, balance DECIMAL(8,2) DEFAULT 0, used DECIMAL(8,2) DEFAULT 0);
CREATE TABLE leave_requests (id INT AUTO_INCREMENT PRIMARY KEY, employee_id INT, leave_type_id INT, start_date DATE, end_date DATE, days DECIMAL(8,2), reason TEXT, status VARCHAR(50) DEFAULT 'pending', approved_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE payroll_periods (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), start_date DATE, end_date DATE, status VARCHAR(50) DEFAULT 'draft', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE payroll_lines (id INT AUTO_INCREMENT PRIMARY KEY, payroll_period_id INT, employee_id INT, basic_salary DECIMAL(15,2) DEFAULT 0, allowances DECIMAL(15,2) DEFAULT 0, deductions DECIMAL(15,2) DEFAULT 0, net_salary DECIMAL(15,2) DEFAULT 0, status VARCHAR(50) DEFAULT 'draft');

CREATE TABLE expense_categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150), code VARCHAR(50), description TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE chart_of_accounts (id INT AUTO_INCREMENT PRIMARY KEY, account_code VARCHAR(50), name VARCHAR(150), type VARCHAR(50), parent_id INT NULL, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE expenses (id INT AUTO_INCREMENT PRIMARY KEY, expense_number VARCHAR(50) UNIQUE, category_id INT NULL, account_id INT NULL, employee_id INT NULL, amount DECIMAL(15,2) DEFAULT 0, expense_date DATE, description TEXT, status VARCHAR(50) DEFAULT 'draft', created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE financial_transactions (id INT AUTO_INCREMENT PRIMARY KEY, transaction_date DATE, reference_type VARCHAR(100), reference_id INT, account_id INT NULL, debit DECIMAL(15,2) DEFAULT 0, credit DECIMAL(15,2) DEFAULT 0, description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE currencies (id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(10), name VARCHAR(100), symbol VARCHAR(10), exchange_rate DECIMAL(15,6) DEFAULT 1, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE tax_configurations (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), rate DECIMAL(8,2) DEFAULT 0, type VARCHAR(50), is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);

CREATE TABLE purchase_orders (id INT AUTO_INCREMENT PRIMARY KEY, po_number VARCHAR(50) UNIQUE, supplier_id INT, status VARCHAR(50) DEFAULT 'draft', order_date DATE NULL, expected_date DATE NULL, total_amount DECIMAL(15,2) DEFAULT 0, created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE purchase_order_items (id INT AUTO_INCREMENT PRIMARY KEY, purchase_order_id INT, part_id INT NULL, vehicle_id INT NULL, description TEXT, quantity INT DEFAULT 1, unit_price DECIMAL(15,2) DEFAULT 0, total_price DECIMAL(15,2) DEFAULT 0);
CREATE TABLE companies (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), legal_name VARCHAR(255), email VARCHAR(255), phone VARCHAR(30), address TEXT, city VARCHAR(100), country VARCHAR(100), tax_number VARCHAR(100), is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE company_branches (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT, name VARCHAR(255), code VARCHAR(50), address TEXT, city VARCHAR(100), phone VARCHAR(30), is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE system_settings (id INT AUTO_INCREMENT PRIMARY KEY, setting_key VARCHAR(150) UNIQUE, setting_value TEXT, category VARCHAR(100), description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE document_templates (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150), type VARCHAR(100), html TEXT, css TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE system_statuses (id INT AUTO_INCREMENT PRIMARY KEY, module VARCHAR(100), status_key VARCHAR(100), name VARCHAR(150), color VARCHAR(30), sort_order INT DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE reports (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150), module VARCHAR(100), query_sql TEXT, parameters JSON, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE report_executions (id INT AUTO_INCREMENT PRIMARY KEY, report_id INT, user_id INT, parameters JSON, status VARCHAR(50), executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE table_sequences (id INT AUTO_INCREMENT PRIMARY KEY, table_name VARCHAR(100) UNIQUE, prefix VARCHAR(20), current_value INT DEFAULT 0, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE of_order_uploads (id INT AUTO_INCREMENT PRIMARY KEY, file_name VARCHAR(255), file_path VARCHAR(255), status VARCHAR(50), uploaded_by INT NULL, uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, notes TEXT);

-- Functions required by middleware/controllers
DROP FUNCTION IF EXISTS fn_has_permission;
DELIMITER //
CREATE FUNCTION fn_has_permission(p_user_id INT, p_module VARCHAR(100), p_action VARCHAR(50)) RETURNS TINYINT DETERMINISTIC
BEGIN
 DECLARE v_role VARCHAR(80);
 SELECT r.name INTO v_role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=p_user_id LIMIT 1;
 IF v_role='super_admin' THEN RETURN 1; END IF;
 RETURN EXISTS(SELECT 1 FROM users u JOIN role_permissions rp ON rp.role_id=u.role_id JOIN permissions p ON p.id=rp.permission_id WHERE u.id=p_user_id AND p.module=p_module AND p.action=p_action AND p.is_active=1);
END//
CREATE FUNCTION fn_employee_full_name(p_employee_id INT) RETURNS VARCHAR(255) DETERMINISTIC
BEGIN
 DECLARE v_name VARCHAR(255);
 SELECT CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,'')) INTO v_name FROM employees WHERE id=p_employee_id LIMIT 1;
 RETURN TRIM(COALESCE(v_name,''));
END//
CREATE FUNCTION fn_get_invoice_qr_data(p_invoice_id INT) RETURNS TEXT DETERMINISTIC
BEGIN
 RETURN (SELECT JSON_OBJECT('invoice_id',id,'invoice_number',invoice_number,'total_amount',total_amount) FROM invoices WHERE id=p_invoice_id LIMIT 1);
END//
DELIMITER ;

-- Views used by controllers: basic definitions to avoid missing-view errors
CREATE OR REPLACE VIEW vw_vehicle_master_stats AS SELECT
 (SELECT COUNT(*) FROM vehicle_makes WHERE is_active=1) total_makes,
 (SELECT COUNT(*) FROM vehicle_models WHERE is_active=1) total_models,
 (SELECT COUNT(*) FROM vehicle_variants WHERE is_active=1) total_variants,
 (SELECT COUNT(*) FROM vehicle_colors WHERE is_active=1) total_colors,
 (SELECT COUNT(*) FROM part_categories WHERE is_active=1) total_categories,
 (SELECT COUNT(*) FROM suppliers WHERE is_active=1) total_suppliers;
CREATE OR REPLACE VIEW vw_users_full AS SELECT u.*, r.name role_name, d.name department_name FROM users u LEFT JOIN roles r ON r.id=u.role_id LEFT JOIN departments d ON d.id=u.department_id;
CREATE OR REPLACE VIEW vw_departments_full AS SELECT d.*, p.name parent_name FROM departments d LEFT JOIN departments p ON p.id=d.parent_id;
CREATE OR REPLACE VIEW vw_employee_directory AS SELECT e.*, d.name department_name, r.name role_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN roles r ON r.id=e.role_id;
CREATE OR REPLACE VIEW vw_partsinventoryfull AS SELECT p.*, c.name category_name, s.name supplier_name, w.name warehouse_name FROM parts p LEFT JOIN part_categories c ON c.id=p.category_id LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN warehouses w ON w.id=p.warehouse_id;
CREATE OR REPLACE VIEW VW_LowStockAlerts AS SELECT * FROM parts WHERE COALESCE(current_stock,quantity,0) <= COALESCE(reorder_level,min_stock,0);
CREATE OR REPLACE VIEW vw_vehicle_inventory_full AS SELECT v.*, mk.name make_name, mo.name model_name, va.name variant_name, c.name color_name, w.name warehouse_name FROM vehicles v LEFT JOIN vehicle_makes mk ON mk.id=v.make_id LEFT JOIN vehicle_models mo ON mo.id=v.model_id LEFT JOIN vehicle_variants va ON va.id=v.variant_id LEFT JOIN vehicle_colors c ON c.id=v.color_id LEFT JOIN warehouses w ON w.id=v.warehouse_id;
CREATE OR REPLACE VIEW vw_customer_summary AS SELECT c.*, COUNT(l.id) leads_count, COUNT(so.id) orders_count FROM customers c LEFT JOIN leads l ON l.customer_id=c.id LEFT JOIN sales_orders so ON so.customer_id=c.id GROUP BY c.id;
CREATE OR REPLACE VIEW vw_sales_orders_full AS SELECT so.*, c.name customer_name, v.vin, v.vehicle_code FROM sales_orders so LEFT JOIN customers c ON c.id=so.customer_id LEFT JOIN vehicles v ON v.id=so.vehicle_id;
CREATE OR REPLACE VIEW vw_sales_stats AS SELECT COUNT(*) total_orders, COALESCE(SUM(total_amount),0) total_sales FROM sales_orders;
CREATE OR REPLACE VIEW vw_invoice_summary AS SELECT i.*, c.name customer_name FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id;
CREATE OR REPLACE VIEW vw_invoice_stats AS SELECT COUNT(*) total_invoices, COALESCE(SUM(total_amount),0) total_amount, COALESCE(SUM(paid_amount),0) paid_amount FROM invoices;
CREATE OR REPLACE VIEW vw_invoice_aging AS SELECT i.*, DATEDIFF(CURDATE(), due_date) aging_days FROM invoices i;
CREATE OR REPLACE VIEW vw_appointments_list AS SELECT a.*, c.name customer_name, v.vin FROM service_appointments a LEFT JOIN customers c ON c.id=a.customer_id LEFT JOIN vehicles v ON v.id=a.vehicle_id;
CREATE OR REPLACE VIEW vw_job_cards_list AS SELECT jc.*, c.name customer_name, v.vin FROM job_cards jc LEFT JOIN customers c ON c.id=jc.customer_id LEFT JOIN vehicles v ON v.id=jc.vehicle_id;
CREATE OR REPLACE VIEW vw_warehouses_full AS SELECT w.*, COUNT(v.id) vehicle_count, COUNT(p.id) parts_count FROM warehouses w LEFT JOIN vehicles v ON v.warehouse_id=w.id LEFT JOIN parts p ON p.warehouse_id=w.id GROUP BY w.id;
CREATE OR REPLACE VIEW vw_company_summary AS SELECT c.*, COUNT(b.id) branch_count FROM companies c LEFT JOIN company_branches b ON b.company_id=c.id GROUP BY c.id;
CREATE OR REPLACE VIEW vw_branch_details AS SELECT b.*, c.name company_name FROM company_branches b LEFT JOIN companies c ON c.id=b.company_id;
CREATE OR REPLACE VIEW vw_unified_ledger AS SELECT id, transaction_date, reference_type, reference_id, account_id, debit, credit, description, created_at FROM financial_transactions;
DROP VIEW IF EXISTS vw_settings_grouped;
CREATE VIEW vw_settings_grouped AS
SELECT
  category,
  CONCAT(
    '{',
    COALESCE(
      GROUP_CONCAT(
        CONCAT(
          '"', REPLACE(setting_key, '"', '\\"'), '":"',
          REPLACE(COALESCE(setting_value, ''), '"', '\\"'),
          '"'
        )
        SEPARATOR ','
      ),
      ''
    ),
    '}'
  ) AS settings
FROM system_settings
GROUP BY category;
CREATE OR REPLACE VIEW vw_erp_stats AS SELECT (SELECT COUNT(*) FROM companies) total_companies, (SELECT COUNT(*) FROM company_branches) total_branches, (SELECT COUNT(*) FROM currencies) total_currencies, (SELECT COUNT(*) FROM tax_configurations) total_taxes;
CREATE OR REPLACE VIEW vw_service_packages_list AS SELECT sp.*, COUNT(spi.id) items_count FROM service_packages sp LEFT JOIN service_package_items spi ON spi.package_id=sp.id GROUP BY sp.id;

-- Seed basic data
INSERT INTO roles (id, name, description, is_active) VALUES
(1,'super_admin','Full access to all system features',1),(2,'admin','Administrative access excluding system config',1),(3,'manager','Managerial access to specific modules',1),(4,'sales_manager','Manage sales team and reports',1),(5,'sales_executive','Create leads, quotations, bookings',1),(6,'service_manager','Manage service center operations',1),(7,'service_advisor','Create job cards, appointments',1),(8,'inventory_manager','Manage vehicles and parts inventory',1),(9,'customer','Customer portal access',1)
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), is_active=VALUES(is_active);
-- Super admin user is intentionally NOT inserted here.
-- Create the first admin manually/API/script after import, using your own credentials.
INSERT INTO lead_sources(name,is_active) VALUES ('Walk-in',1),('Facebook',1),('Website',1),('Referral',1);
INSERT INTO vehicle_brands(name,code,is_active) VALUES ('OMODA','OMODA',1),('JAECOO','JAECOO',1);
INSERT INTO vehicle_makes(name,code,is_active) VALUES ('OMODA','OMODA',1),('JAECOO','JAECOO',1);
INSERT INTO vehicle_colors(name,code,hex_code,is_active) VALUES ('White','WHITE','#FFFFFF',1),('Black','BLACK','#000000',1),('Silver','SILVER','#C0C0C0',1);
INSERT INTO part_categories(name,code,is_active) VALUES ('General','GEN',1),('Engine','ENG',1),('Body','BODY',1);
INSERT INTO suppliers(supplier_code,name,type,city,country,is_active) VALUES ('SUP-001','Default Supplier','local_vendor','Lahore','Pakistan',1);
INSERT INTO warehouses(name,code,type,city,is_active) VALUES ('Main Warehouse','MAIN','general','Lahore',1);
INSERT INTO payment_methods(name,code,type,is_active) VALUES ('Cash','CASH','cash',1),('Bank Transfer','BANK','bank',1),('Card','CARD','card',1);
INSERT INTO currencies(code,name,symbol,exchange_rate,is_active) VALUES ('PKR','Pakistani Rupee','Rs',1,1);

-- =====================================================================
-- ROOT SQL MERGED: supplier_management_live.sql
-- Purpose: supplier stored procedures + supplier stats view.
-- Now included here so you do NOT need to import it separately.
-- =====================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- SUPPLIER MANAGEMENT - DATABASE ENHANCEMENTS
-- Created by LOGIXINVENTOR (PVT) Ltd.
-- info@logixinventor.com +92 333 3836851
-- www.logixinventor.com | AMS
-- Date: 2026-04-05
-- ═══════════════════════════════════════════════════════════════════════════

--  -- Removed for environment flexibility

-- ═══════════════════════════════════════════════════════════════════════════
-- STORED PROCEDURES - SUPPLIERS
-- ═══════════════════════════════════════════════════════════════════════════

DROP PROCEDURE IF EXISTS sp_get_suppliers;
DROP PROCEDURE IF EXISTS sp_create_supplier;
DROP PROCEDURE IF EXISTS sp_update_supplier;
DROP PROCEDURE IF EXISTS sp_delete_supplier;

DELIMITER //

-- Get all suppliers with stats
CREATE PROCEDURE sp_get_suppliers(
    IN p_search VARCHAR(100),
    IN p_is_active BOOLEAN,
    IN p_limit INT,
    IN p_offset INT
)
BEGIN
    SELECT 
        s.id,
        s.supplier_code,
        s.name,
        s.type,
        s.contact_person,
        s.email,
        s.phone,
        s.address,
        s.city,
        s.country,
        s.tax_number,
        s.payment_terms,
        s.credit_limit,
        s.outstanding_balance,
        s.is_active,
        s.created_at,
        (SELECT COUNT(*) FROM parts WHERE supplier_id = s.id) AS parts_count,
        (SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = s.id) AS po_count
    FROM suppliers s
    WHERE (p_search IS NULL OR p_search = '' OR 
           s.name LIKE CONCAT('%', p_search, '%') OR 
           s.supplier_code LIKE CONCAT('%', p_search, '%') OR
           s.contact_person LIKE CONCAT('%', p_search, '%'))
      AND (p_is_active IS NULL OR s.is_active = p_is_active)
    ORDER BY s.name
    LIMIT p_limit OFFSET p_offset;
END //

-- Create supplier
CREATE PROCEDURE sp_create_supplier(
    IN p_supplier_code VARCHAR(20),
    IN p_name VARCHAR(255),
    IN p_type ENUM('oem', 'distributor', 'local_vendor'),
    IN p_contact_person VARCHAR(100),
    IN p_email VARCHAR(255),
    IN p_phone VARCHAR(20),
    IN p_address TEXT,
    IN p_city VARCHAR(100),
    IN p_country VARCHAR(100),
    IN p_tax_number VARCHAR(50),
    IN p_payment_terms VARCHAR(100),
    IN p_credit_limit DECIMAL(15,2),
    IN p_is_active BOOLEAN,
    OUT p_supplier_id INT
)
BEGIN
    -- Check for duplicate code
    IF EXISTS (SELECT 1 FROM suppliers WHERE supplier_code = p_supplier_code) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Supplier code already exists';
    END IF;
    
    INSERT INTO suppliers (
        supplier_code, name, type, contact_person, email, phone, 
        address, city, country, tax_number, payment_terms, 
        credit_limit, is_active, created_at
    )
    VALUES (
        p_supplier_code, p_name, p_type, p_contact_person, p_email, p_phone,
        p_address, p_city, p_country, p_tax_number, p_payment_terms,
        COALESCE(p_credit_limit, 0), COALESCE(p_is_active, TRUE), NOW()
    );
    
    SET p_supplier_id = LAST_INSERT_ID();
END //

-- Update supplier
CREATE PROCEDURE sp_update_supplier(
    IN p_id INT,
    IN p_supplier_code VARCHAR(20),
    IN p_name VARCHAR(255),
    IN p_type ENUM('oem', 'distributor', 'local_vendor'),
    IN p_contact_person VARCHAR(100),
    IN p_email VARCHAR(255),
    IN p_phone VARCHAR(20),
    IN p_address TEXT,
    IN p_city VARCHAR(100),
    IN p_country VARCHAR(100),
    IN p_tax_number VARCHAR(50),
    IN p_payment_terms VARCHAR(100),
    IN p_credit_limit DECIMAL(15,2),
    IN p_is_active BOOLEAN
)
BEGIN
    -- Check exists
    IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = p_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Supplier not found';
    END IF;
    
    -- Check duplicate code
    IF EXISTS (SELECT 1 FROM suppliers WHERE supplier_code = p_supplier_code AND id != p_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Supplier code already exists';
    END IF;
    
    UPDATE suppliers 
    SET supplier_code = COALESCE(p_supplier_code, supplier_code),
        name = COALESCE(p_name, name),
        type = COALESCE(p_type, type),
        contact_person = COALESCE(p_contact_person, contact_person),
        email = COALESCE(p_email, email),
        phone = COALESCE(p_phone, phone),
        address = COALESCE(p_address, address),
        city = COALESCE(p_city, city),
        country = COALESCE(p_country, country),
        tax_number = COALESCE(p_tax_number, tax_number),
        payment_terms = COALESCE(p_payment_terms, payment_terms),
        credit_limit = COALESCE(p_credit_limit, credit_limit),
        is_active = COALESCE(p_is_active, is_active),
        updated_at = NOW()
    WHERE id = p_id;
END //

-- Delete supplier
CREATE PROCEDURE sp_delete_supplier(IN p_id INT)
BEGIN
    DECLARE v_parts_count INT;
    DECLARE v_po_count INT;
    
    -- Check exists
    IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = p_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Supplier not found';
    END IF;
    
    -- Check for dependencies
    SELECT COUNT(*) INTO v_parts_count FROM parts WHERE supplier_id = p_id;
    SELECT COUNT(*) INTO v_po_count FROM purchase_orders WHERE supplier_id = p_id;
    
    IF v_parts_count > 0 OR v_po_count > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot delete supplier with existing parts or purchase orders. Deactivate instead.';
    END IF;
    
    DELETE FROM suppliers WHERE id = p_id;
END //

DELIMITER ;

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE STATS VIEW
-- ═══════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS vw_vehicle_master_stats;

CREATE VIEW vw_vehicle_master_stats AS
SELECT 
    (SELECT COUNT(*) FROM vehicle_makes WHERE is_active = TRUE) AS total_makes,
    (SELECT COUNT(*) FROM vehicle_models WHERE is_active = TRUE) AS total_models,
    (SELECT COUNT(*) FROM vehicle_variants WHERE is_active = TRUE) AS total_variants,
    (SELECT COUNT(*) FROM vehicle_colors WHERE is_active = TRUE) AS total_colors,
    (SELECT COUNT(*) FROM part_categories WHERE is_active = TRUE) AS total_categories,
    (SELECT COUNT(*) FROM suppliers WHERE is_active = TRUE) AS total_suppliers;

SELECT 'Supplier management enhancements executed successfully!' as Status;

SET FOREIGN_KEY_CHECKS=1;
