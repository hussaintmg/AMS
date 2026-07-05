/**
 * ERP Settings Controller
 * Comprehensive CRUD operations for Company, Branch, Settings, Currency, and Tax Management
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-08
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { normalizePhone } = require('../utils/phone.util');
const defaultDocumentTemplates = require('../constants/defaultDocumentTemplates');

const DOCUMENT_TEMPLATE_TYPES = new Set(['quotation', 'booking', 'order', 'invoice']);

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all companies
 * @route GET /api/erp-settings/companies
 */
const getAllCompanies = async (req, res, next) => {
    try {
        const { active, search } = req.query;

        let sql = `SELECT * FROM vw_company_summary WHERE 1=1`;
        const params = [];

        if (active !== undefined) {
            sql += ` AND is_active = ?`;
            params.push(active === 'true');
        }
        if (search) {
            sql += ` AND (company_name LIKE ? OR company_code LIKE ? OR email LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        sql += ` ORDER BY is_active DESC, id DESC`;

        const companies = await query(sql, params);

        res.json({
            success: true,
            data: companies
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get company by ID with branches
 * @route GET /api/erp-settings/companies/:id
 */
const getCompanyById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const company = await query(`SELECT * FROM vw_company_summary WHERE id = ?`, [id]);

        if (company.length === 0) {
            throw new AppError('Company not found', 404);
        }

        const branches = await query(`SELECT * FROM vw_branch_details WHERE company_id = ? ORDER BY branch_type, branch_name`, [id]);

        res.json({
            success: true,
            data: {
                ...company[0],
                branches
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create new company
 * @route POST /api/erp-settings/companies
 */
const createCompany = async (req, res, next) => {
    try {
        const {
            companyName, legalName, registrationNumber, taxId,
            email, phone, fax, website, address, city, state,
            country, postalCode, currencyCode, fiscalYearStart, timezone
        } = req.body;
        const normalizedPhone = phone ? normalizePhone(phone) : null;

        if (!companyName) {
            throw new AppError('Company name is required', 400);
        }

        // Call stored procedure
        await query(`CALL sp_create_company(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @company_id, @company_code)`, [
            companyName, legalName || null, registrationNumber || null, taxId || null,
            email || null, normalizedPhone, address || null, city || null,
            country || 'Pakistan', req.user.id
        ]);

        const result = await query(`SELECT @company_id as id, @company_code as company_code`);
        const companyId = result[0].id;

        // Update additional fields if provided
        const updates = [];
        const updateParams = [];

        if (fax) { updates.push('fax = ?'); updateParams.push(fax); }
        if (website) { updates.push('website = ?'); updateParams.push(website); }
        if (state) { updates.push('state = ?'); updateParams.push(state); }
        if (postalCode) { updates.push('postal_code = ?'); updateParams.push(postalCode); }
        if (currencyCode) { updates.push('currency_code = ?'); updateParams.push(currencyCode); }
        if (fiscalYearStart) { updates.push('fiscal_year_start = ?'); updateParams.push(fiscalYearStart); }
        if (timezone) { updates.push('timezone = ?'); updateParams.push(timezone); }

        if (updates.length > 0) {
            updateParams.push(companyId);
            await query(`UPDATE companies SET ${updates.join(', ')} WHERE id = ?`, updateParams);
        }

        res.status(201).json({
            success: true,
            message: 'Company created successfully',
            data: {
                id: companyId,
                company_code: result[0].company_code
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update company
 * @route PUT /api/erp-settings/companies/:id
 */
const updateCompany = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            companyName, legalName, registrationNumber, taxId,
            email, phone, fax, website, address, city, state,
            country, postalCode, currencyCode, fiscalYearStart, timezone, isActive
        } = req.body;
        const normalizedPhone = phone !== undefined && phone !== null && phone !== '' ? normalizePhone(phone) : phone;

        // Check company exists
        const existing = await query(`SELECT id FROM companies WHERE id = ?`, [id]);
        if (existing.length === 0) {
            throw new AppError('Company not found', 404);
        }

        // Build dynamic update
        const updates = [];
        const params = [];

        if (companyName !== undefined) { updates.push('company_name = ?'); params.push(companyName); }
        if (legalName !== undefined) { updates.push('legal_name = ?'); params.push(legalName); }
        if (registrationNumber !== undefined) { updates.push('registration_number = ?'); params.push(registrationNumber); }
        if (taxId !== undefined) { updates.push('tax_id = ?'); params.push(taxId); }
        if (email !== undefined) { updates.push('email = ?'); params.push(email); }
        if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
        if (fax !== undefined) { updates.push('fax = ?'); params.push(fax); }
        if (website !== undefined) { updates.push('website = ?'); params.push(website); }
        if (address !== undefined) { updates.push('address = ?'); params.push(address); }
        if (city !== undefined) { updates.push('city = ?'); params.push(city); }
        if (state !== undefined) { updates.push('state = ?'); params.push(state); }
        if (country !== undefined) { updates.push('country = ?'); params.push(country); }
        if (postalCode !== undefined) { updates.push('postal_code = ?'); params.push(postalCode); }
        if (currencyCode !== undefined) { updates.push('currency_code = ?'); params.push(currencyCode); }
        if (fiscalYearStart !== undefined) { updates.push('fiscal_year_start = ?'); params.push(fiscalYearStart); }
        if (timezone !== undefined) { updates.push('timezone = ?'); params.push(timezone); }
        if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive); }

        if (updates.length === 0) {
            throw new AppError('No fields to update', 400);
        }

        params.push(id);
        await query(`UPDATE companies SET ${updates.join(', ')} WHERE id = ?`, params);

        res.json({
            success: true,
            message: 'Company updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete company
 * @route DELETE /api/erp-settings/companies/:id
 */
const deleteCompany = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check company exists
        const existing = await query(`SELECT id FROM companies WHERE id = ?`, [id]);
        if (existing.length === 0) {
            throw new AppError('Company not found', 404);
        }

        // Soft delete - set is_active to false
        await query(`UPDATE companies SET is_active = FALSE WHERE id = ?`, [id]);

        res.json({
            success: true,
            message: 'Company deactivated successfully'
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// BRANCH MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all branches
 * @route GET /api/erp-settings/branches
 */
const getAllBranches = async (req, res, next) => {
    try {
        const { companyId, branchType, active, search } = req.query;

        let sql = `SELECT * FROM vw_branch_details WHERE 1=1`;
        const params = [];

        if (companyId) {
            sql += ` AND company_id = ?`;
            params.push(companyId);
        }
        if (branchType) {
            sql += ` AND branch_type = ?`;
            params.push(branchType);
        }
        if (active !== undefined) {
            sql += ` AND is_active = ?`;
            params.push(active === 'true');
        }
        if (search) {
            sql += ` AND (branch_name LIKE ? OR branch_code LIKE ? OR city LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        sql += ` ORDER BY company_name, branch_type, branch_name`;

        const branches = await query(sql, params);

        res.json({
            success: true,
            data: branches
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get branch by ID
 * @route GET /api/erp-settings/branches/:id
 */
const getBranchById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const branch = await query(`SELECT * FROM vw_branch_details WHERE id = ?`, [id]);

        if (branch.length === 0) {
            throw new AppError('Branch not found', 404);
        }

        res.json({
            success: true,
            data: branch[0]
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create new branch
 * @route POST /api/erp-settings/branches
 */
const createBranch = async (req, res, next) => {
    try {
        const {
            companyId, branchName, branchType, managerId,
            email, phone, fax, address, city, state, country,
            postalCode, latitude, longitude, openingHours
        } = req.body;

        if (!companyId || !branchName) {
            throw new AppError('Company ID and branch name are required', 400);
        }

        // Call stored procedure
        await query(`CALL sp_create_branch(?, ?, ?, ?, ?, ?, ?, ?, ?, @branch_id, @branch_code)`, [
            companyId, branchName, branchType || 'regional', managerId || null,
            email || null, phone || null, address || null, city || null, req.user.id
        ]);

        const result = await query(`SELECT @branch_id as id, @branch_code as branch_code`);
        const branchId = result[0].id;

        // Update additional fields
        const updates = [];
        const updateParams = [];

        if (fax) { updates.push('fax = ?'); updateParams.push(fax); }
        if (state) { updates.push('state = ?'); updateParams.push(state); }
        if (country) { updates.push('country = ?'); updateParams.push(country); }
        if (postalCode) { updates.push('postal_code = ?'); updateParams.push(postalCode); }
        if (latitude) { updates.push('latitude = ?'); updateParams.push(latitude); }
        if (longitude) { updates.push('longitude = ?'); updateParams.push(longitude); }
        if (openingHours) { updates.push('opening_hours = ?'); updateParams.push(openingHours); }

        if (updates.length > 0) {
            updateParams.push(branchId);
            await query(`UPDATE company_branches SET ${updates.join(', ')} WHERE id = ?`, updateParams);
        }

        res.status(201).json({
            success: true,
            message: 'Branch created successfully',
            data: {
                id: branchId,
                branch_code: result[0].branch_code
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update branch
 * @route PUT /api/erp-settings/branches/:id
 */
const updateBranch = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            companyId, branchName, branchType, managerId, email, phone, fax,
            address, city, state, country, postalCode, latitude,
            longitude, openingHours, isActive
        } = req.body;

        // Check branch exists
        const existing = await query(`SELECT id FROM company_branches WHERE id = ?`, [id]);
        if (existing.length === 0) {
            throw new AppError('Branch not found', 404);
        }

        const updates = [];
        const params = [];

        if (companyId !== undefined) { updates.push('company_id = ?'); params.push(companyId); }
        if (branchName !== undefined) { updates.push('branch_name = ?'); params.push(branchName); }
        if (branchType !== undefined) { updates.push('branch_type = ?'); params.push(branchType); }
        if (managerId !== undefined) { updates.push('manager_id = ?'); params.push(managerId || null); }
        if (email !== undefined) { updates.push('email = ?'); params.push(email); }
        if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
        if (fax !== undefined) { updates.push('fax = ?'); params.push(fax); }
        if (address !== undefined) { updates.push('address = ?'); params.push(address); }
        if (city !== undefined) { updates.push('city = ?'); params.push(city); }
        if (state !== undefined) { updates.push('state = ?'); params.push(state); }
        if (country !== undefined) { updates.push('country = ?'); params.push(country); }
        if (postalCode !== undefined) { updates.push('postal_code = ?'); params.push(postalCode); }
        if (latitude !== undefined) { updates.push('latitude = ?'); params.push(latitude); }
        if (longitude !== undefined) { updates.push('longitude = ?'); params.push(longitude); }
        if (openingHours !== undefined) { updates.push('opening_hours = ?'); params.push(openingHours); }
        if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive); }

        if (updates.length === 0) {
            throw new AppError('No fields to update', 400);
        }

        params.push(id);
        await query(`UPDATE company_branches SET ${updates.join(', ')} WHERE id = ?`, params);

        res.json({
            success: true,
            message: 'Branch updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete branch
 * @route DELETE /api/erp-settings/branches/:id
 */
const deleteBranch = async (req, res, next) => {
    try {
        const { id } = req.params;

        const existing = await query(`SELECT id, branch_type FROM company_branches WHERE id = ?`, [id]);
        if (existing.length === 0) {
            throw new AppError('Branch not found', 404);
        }

        if (existing[0].branch_type === 'head_office') {
            throw new AppError('Cannot delete head office branch', 400);
        }

        await query(`UPDATE company_branches SET is_active = FALSE WHERE id = ?`, [id]);

        res.json({
            success: true,
            message: 'Branch deactivated successfully'
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all settings
 * @route GET /api/erp-settings/settings
 */
const getAllSettings = async (req, res, next) => {
    try {
        const { category } = req.query;

        let sql = `
            SELECT setting_key, setting_value, setting_type, category, 
                   display_name, description, is_editable
            FROM system_settings
            WHERE 1=1
        `;
        const params = [];

        if (category) {
            sql += ` AND category = ?`;
            params.push(category);
        }

        sql += ` ORDER BY category, display_name`;

        const settings = await query(sql, params);

        // Group by category
        const grouped = settings.reduce((acc, setting) => {
            if (!acc[setting.category]) {
                acc[setting.category] = [];
            }
            acc[setting.category].push(setting);
            return acc;
        }, {});

        res.json({
            success: true,
            data: settings,
            grouped
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update settings (bulk update)
 * @route PUT /api/erp-settings/settings
 */
const updateSettings = async (req, res, next) => {
    try {
        const { settings } = req.body;
        const ipAddress = req.ip || req.connection.remoteAddress;

        if (!Array.isArray(settings) || settings.length === 0) {
            throw new AppError('Settings array is required', 400);
        }

        for (const setting of settings) {
            if (!setting.key || setting.value === undefined) continue;

            try {
                await query(`CALL sp_update_system_setting(?, ?, ?, ?)`, [
                    setting.key, String(setting.value), req.user.id, ipAddress
                ]);
            } catch (err) {
                // Log but continue with other settings
                console.error(`Failed to update setting ${setting.key}:`, err.message);
            }
        }

        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get setting categories
 * @route GET /api/erp-settings/settings/categories
 */
const getSettingCategories = async (req, res, next) => {
    try {
        const categories = await query(`SELECT * FROM vw_settings_grouped ORDER BY category`);

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// CURRENCY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all currencies
 * @route GET /api/erp-settings/currencies
 */
const getAllCurrencies = async (req, res, next) => {
    try {
        const { active } = req.query;

        let sql = `SELECT * FROM currencies WHERE 1=1`;
        const params = [];

        if (active !== undefined) {
            sql += ` AND is_active = ?`;
            params.push(active === 'true');
        }

        sql += ` ORDER BY is_default DESC, name`;

        const currencies = await query(sql, params);

        res.json({
            success: true,
            data: currencies
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create currency
 * @route POST /api/erp-settings/currencies
 */
const createCurrency = async (req, res, next) => {
    try {
        const { code, name, symbol, exchangeRate, decimalPlaces, isDefault } = req.body;

        if (!code || !name || !symbol) {
            throw new AppError('Code, name, and symbol are required', 400);
        }

        // Check if code exists
        const existing = await query(`SELECT id FROM currencies WHERE code = ?`, [code]);
        if (existing.length > 0) {
            throw new AppError('Currency code already exists', 400);
        }

        // If setting as default, unset other defaults first
        if (isDefault) {
            await query(`UPDATE currencies SET is_default = FALSE`);
        }

        const result = await query(`
            INSERT INTO currencies (code, name, symbol, exchange_rate, decimal_places, is_default, is_active)
            VALUES (?, ?, ?, ?, ?, ?, TRUE)
        `, [
            code.toUpperCase(),
            name,
            symbol,
            parseFloat(exchangeRate) || 1,
            parseInt(decimalPlaces) || 2,
            isDefault || false
        ]);

        res.status(201).json({
            success: true,
            message: 'Currency created successfully',
            data: { id: result.insertId }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update currency
 * @route PUT /api/erp-settings/currencies/:id
 */
const updateCurrency = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, symbol, exchangeRate, decimalPlaces, isDefault, isActive } = req.body;

        const existing = await query(`SELECT id FROM currencies WHERE id = ?`, [id]);
        if (existing.length === 0) {
            throw new AppError('Currency not found', 404);
        }

        const updates = [];
        const params = [];

        if (name !== undefined) { updates.push('name = ?'); params.push(name); }
        if (symbol !== undefined) { updates.push('symbol = ?'); params.push(symbol); }
        if (exchangeRate !== undefined) { updates.push('exchange_rate = ?'); params.push(parseFloat(exchangeRate)); }
        if (decimalPlaces !== undefined) { updates.push('decimal_places = ?'); params.push(parseInt(decimalPlaces)); }
        if (isDefault !== undefined) { updates.push('is_default = ?'); params.push(isDefault); }
        if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive); }

        if (updates.length === 0) {
            throw new AppError('No fields to update', 400);
        }

        params.push(id);
        await query(`UPDATE currencies SET ${updates.join(', ')} WHERE id = ?`, params);

        res.json({
            success: true,
            message: 'Currency updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete currency
 * @route DELETE /api/erp-settings/currencies/:id
 */
const deleteCurrency = async (req, res, next) => {
    try {
        const { id } = req.params;

        const existing = await query(`SELECT id, is_default FROM currencies WHERE id = ?`, [id]);
        if (existing.length === 0) {
            throw new AppError('Currency not found', 404);
        }

        if (existing[0].is_default) {
            throw new AppError('Cannot delete default currency', 400);
        }

        await query(`UPDATE currencies SET is_active = FALSE WHERE id = ?`, [id]);

        res.json({
            success: true,
            message: 'Currency deactivated successfully'
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// TAX CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all tax configurations
 * @route GET /api/erp-settings/taxes
 */
const getAllTaxes = async (req, res, next) => {
    try {
        const { active, taxType } = req.query;

        let sql = `SELECT * FROM tax_configurations WHERE 1=1`;
        const params = [];

        if (active !== undefined) {
            sql += ` AND is_active = ?`;
            params.push(active === 'true');
        }
        if (taxType) {
            sql += ` AND tax_type = ?`;
            params.push(taxType);
        }

        sql += ` ORDER BY tax_type, tax_name`;

        const taxes = await query(sql, params);

        res.json({
            success: true,
            data: taxes
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create tax configuration
 * @route POST /api/erp-settings/taxes
 */
const createTax = async (req, res, next) => {
    try {
        const { taxName, taxCode, taxRate, taxType, description, isCompound, appliesTo } = req.body;

        if (!taxName || !taxCode || taxRate === undefined) {
            throw new AppError('Tax name, code, and rate are required', 400);
        }

        const existing = await query(`SELECT id FROM tax_configurations WHERE tax_code = ?`, [taxCode]);
        if (existing.length > 0) {
            throw new AppError('Tax code already exists', 400);
        }

        const result = await query(`
            INSERT INTO tax_configurations (tax_name, tax_code, tax_rate, tax_type, description, is_compound, applies_to, created_by, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)
        `, [
            taxName,
            taxCode.toUpperCase(),
            parseFloat(taxRate),
            taxType || 'sales',
            description || null,
            isCompound || false,
            appliesTo || 'all',
            req.user.id
        ]);

        res.status(201).json({
            success: true,
            message: 'Tax configuration created successfully',
            data: { id: result.insertId }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update tax configuration
 * @route PUT /api/erp-settings/taxes/:id
 */
const updateTax = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { taxName, taxRate, taxType, description, isCompound, appliesTo, isActive } = req.body;

        const existing = await query(`SELECT id FROM tax_configurations WHERE id = ?`, [id]);
        if (existing.length === 0) {
            throw new AppError('Tax configuration not found', 404);
        }

        const updates = [];
        const params = [];

        if (taxName !== undefined) { updates.push('tax_name = ?'); params.push(taxName); }
        if (taxRate !== undefined) { updates.push('tax_rate = ?'); params.push(parseFloat(taxRate)); }
        if (taxType !== undefined) { updates.push('tax_type = ?'); params.push(taxType); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (isCompound !== undefined) { updates.push('is_compound = ?'); params.push(isCompound); }
        if (appliesTo !== undefined) { updates.push('applies_to = ?'); params.push(appliesTo); }
        if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive); }

        if (updates.length === 0) {
            throw new AppError('No fields to update', 400);
        }

        params.push(id);
        await query(`UPDATE tax_configurations SET ${updates.join(', ')} WHERE id = ?`, params);

        res.json({
            success: true,
            message: 'Tax configuration updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete tax configuration
 * @route DELETE /api/erp-settings/taxes/:id
 */
const deleteTax = async (req, res, next) => {
    try {
        const { id } = req.params;

        const existing = await query(`SELECT id FROM tax_configurations WHERE id = ?`, [id]);
        if (existing.length === 0) {
            throw new AppError('Tax configuration not found', 404);
        }

        await query(`UPDATE tax_configurations SET is_active = FALSE WHERE id = ?`, [id]);

        res.json({
            success: true,
            message: 'Tax configuration deactivated successfully'
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS & UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get ERP statistics
 * @route GET /api/erp-settings/stats
 */
const getERPStats = async (req, res, next) => {
    try {
        const stats = await query(`SELECT * FROM vw_erp_stats`);

        res.json({
            success: true,
            data: stats[0] || {}
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get users for manager dropdown
 * @route GET /api/erp-settings/managers
 */
const getManagers = async (req, res, next) => {
    try {
        const managers = await query(`
            SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) as name, u.email, r.name as role_name
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE u.is_active = TRUE
            ORDER BY u.first_name
        `);

        res.json({
            success: true,
            data: managers
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT HTML TEMPLATES (sales print)
// ═══════════════════════════════════════════════════════════════════════════

const ensureDefaultDocumentTemplates = async () => {
    const cnt = await query(`SELECT COUNT(*) AS n FROM document_templates`);
    if (Number(cnt[0]?.n || 0) > 0) return;
    const seeds = [
        ['quotation', 'Standard quotation', defaultDocumentTemplates.quotation],
        ['booking', 'Standard booking', defaultDocumentTemplates.booking],
        ['order', 'Standard sales order', defaultDocumentTemplates.order],
        ['invoice', 'Standard invoice (dealer)', defaultDocumentTemplates.invoice]
    ];
    for (const [documentType, name, html] of seeds) {
        await query(
            `INSERT INTO document_templates (document_type, name, html_content, company_id, is_default, is_active)
             VALUES (?, ?, ?, NULL, TRUE, TRUE)`,
            [documentType, name, html]
        );
    }
};

const clearDefaultForScope = async (documentType, companyId) => {
    if (companyId == null || companyId === '') {
        await query(
            `UPDATE document_templates SET is_default = FALSE WHERE document_type = ? AND company_id IS NULL`,
            [documentType]
        );
    } else {
        await query(
            `UPDATE document_templates SET is_default = FALSE WHERE document_type = ? AND company_id = ?`,
            [documentType, companyId]
        );
    }
};

const getAllDocumentTemplates = async (req, res, next) => {
    try {
        await ensureDefaultDocumentTemplates();
        const { documentType, active } = req.query;
        let sql = `SELECT id, document_type, name, company_id, is_default, is_active, created_at, updated_at,
            CHAR_LENGTH(html_content) AS html_length
            FROM document_templates WHERE 1=1`;
        const params = [];
        if (documentType) {
            if (!DOCUMENT_TEMPLATE_TYPES.has(documentType)) {
                throw new AppError('Invalid document type', 400);
            }
            sql += ` AND document_type = ?`;
            params.push(documentType);
        }
        if (active !== undefined) {
            sql += ` AND is_active = ?`;
            params.push(active === 'true');
        }
        sql += ` ORDER BY document_type, is_default DESC, name`;
        const rows = await query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
};

const getDocumentTemplateById = async (req, res, next) => {
    try {
        await ensureDefaultDocumentTemplates();
        const { id } = req.params;
        const rows = await query(`SELECT * FROM document_templates WHERE id = ?`, [id]);
        if (!rows.length) throw new AppError('Template not found', 404);
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        next(error);
    }
};

const getDefaultDocumentTemplate = async (req, res, next) => {
    try {
        await ensureDefaultDocumentTemplates();
        const { documentType } = req.params;
        if (!DOCUMENT_TEMPLATE_TYPES.has(documentType)) {
            throw new AppError('Invalid document type', 400);
        }
        const companyId = req.query.companyId ? parseInt(req.query.companyId, 10) : null;
        let rows = [];
        if (companyId && !Number.isNaN(companyId)) {
            rows = await query(
                `SELECT * FROM document_templates WHERE document_type = ? AND is_active = TRUE
                 AND company_id = ? AND is_default = TRUE ORDER BY id DESC LIMIT 1`,
                [documentType, companyId]
            );
        }
        if (!rows.length) {
            rows = await query(
                `SELECT * FROM document_templates WHERE document_type = ? AND is_active = TRUE
                 AND company_id IS NULL AND is_default = TRUE ORDER BY id DESC LIMIT 1`,
                [documentType]
            );
        }
        if (!rows.length) {
            rows = await query(
                `SELECT * FROM document_templates WHERE document_type = ? AND is_active = TRUE
                 ORDER BY is_default DESC, id DESC LIMIT 1`,
                [documentType]
            );
        }
        res.json({ success: true, data: rows[0] || null });
    } catch (error) {
        next(error);
    }
};

const createDocumentTemplate = async (req, res, next) => {
    try {
        const {
            documentType, name, htmlContent, companyId, isDefault
        } = req.body;
        if (!DOCUMENT_TEMPLATE_TYPES.has(documentType)) {
            throw new AppError('Invalid document type', 400);
        }
        if (!name || !htmlContent) {
            throw new AppError('Name and htmlContent are required', 400);
        }
        const cid = companyId === undefined || companyId === '' ? null : parseInt(companyId, 10);
        if (isDefault) {
            await clearDefaultForScope(documentType, cid);
        }
        const result = await query(
            `INSERT INTO document_templates (document_type, name, html_content, company_id, is_default, is_active, created_by)
             VALUES (?, ?, ?, ?, ?, TRUE, ?)`,
            [documentType, name, htmlContent, Number.isNaN(cid) ? null : cid, !!isDefault, req.user?.id || null]
        );
        res.status(201).json({
            success: true,
            message: 'Template created',
            data: { id: result.insertId }
        });
    } catch (error) {
        next(error);
    }
};

const updateDocumentTemplate = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            documentType, name, htmlContent, companyId, isDefault, isActive
        } = req.body;
        const existing = await query(`SELECT * FROM document_templates WHERE id = ?`, [id]);
        if (!existing.length) throw new AppError('Template not found', 404);
        const cur = existing[0];
        const nextType = documentType || cur.document_type;
        if (!DOCUMENT_TEMPLATE_TYPES.has(nextType)) {
            throw new AppError('Invalid document type', 400);
        }
        const cid = companyId !== undefined
            ? (companyId === '' || companyId === null ? null : parseInt(companyId, 10))
            : cur.company_id;
        if (isDefault) {
            await clearDefaultForScope(nextType, cid);
        }
        const nextActive = isActive !== undefined ? !!isActive : !!cur.is_active;
        await query(
            `UPDATE document_templates SET
                document_type = ?, name = ?, html_content = ?, company_id = ?,
                is_default = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                nextType,
                name ?? cur.name,
                htmlContent ?? cur.html_content,
                cid === undefined || Number.isNaN(cid) ? cur.company_id : cid,
                isDefault !== undefined ? !!isDefault : !!cur.is_default,
                nextActive,
                id
            ]
        );
        res.json({ success: true, message: 'Template updated' });
    } catch (error) {
        next(error);
    }
};

const deleteDocumentTemplate = async (req, res, next) => {
    try {
        const { id } = req.params;
        const existing = await query(`SELECT id FROM document_templates WHERE id = ?`, [id]);
        if (!existing.length) throw new AppError('Template not found', 404);
        await query(`UPDATE document_templates SET is_active = FALSE, is_default = FALSE WHERE id = ?`, [id]);
        res.json({ success: true, message: 'Template deactivated' });
    } catch (error) {
        next(error);
    }
};

const seedDocumentTemplates = async (req, res, next) => {
    try {
        await query(`DELETE FROM document_templates`);
        await ensureDefaultDocumentTemplates();
        res.json({ success: true, message: 'Factory templates installed' });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    // Companies
    getAllCompanies,
    getCompanyById,
    createCompany,
    updateCompany,
    deleteCompany,
    // Branches
    getAllBranches,
    getBranchById,
    createBranch,
    updateBranch,
    deleteBranch,
    // Settings
    getAllSettings,
    updateSettings,
    getSettingCategories,
    // Currencies
    getAllCurrencies,
    createCurrency,
    updateCurrency,
    deleteCurrency,
    // Taxes
    getAllTaxes,
    createTax,
    updateTax,
    deleteTax,
    // Stats & Utils
    getERPStats,
    getManagers,
    // Document templates
    getAllDocumentTemplates,
    getDocumentTemplateById,
    getDefaultDocumentTemplate,
    createDocumentTemplate,
    updateDocumentTemplate,
    deleteDocumentTemplate,
    seedDocumentTemplates
};
