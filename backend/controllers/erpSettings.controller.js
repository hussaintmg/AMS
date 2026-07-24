/**
 * ERP Settings Controller (MongoDB)
 * Comprehensive CRUD operations for Company, Branch, Settings, Currency, and Tax Management
 *
 * Migrated off the legacy MySQL stored procedures — the MySQL layer is a stub since the
 * MongoDB migration, so every read returned empty and every write crashed.
 *
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-08
 */

const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');
const { normalizePhone } = require('../utils/phone.util');
const defaultDocumentTemplates = require('../constants/defaultDocumentTemplates');
const {
    Company,
    Branch,
    Currency,
    TaxConfig,
    DocumentTemplate,
    DOCUMENT_TEMPLATE_TYPES: TEMPLATE_TYPE_LIST,
} = require('../models/ErpSettings.model');
const SystemSetting = require('../models/SystemSetting.model');
const User = require('../models/User.model');

const DOCUMENT_TEMPLATE_TYPES = new Set(TEMPLATE_TYPE_LIST);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toObjectId = (value) => (mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null);

/**
 * Sequential code generator based on the MAX existing number, not on insertion order —
 * deriving "next" from the newest document breaks as soon as a row is deleted or
 * backfilled out of order.
 */
async function nextCode(Model, field, prefix, width = 4) {
    const rows = await Model.find({ [field]: new RegExp(`^${prefix}-\\d+$`) })
        .select(field)
        .lean();
    const max = rows.reduce((acc, row) => {
        const n = parseInt(String(row[field]).slice(prefix.length + 1), 10);
        return Number.isFinite(n) && n > acc ? n : acc;
    }, 0);
    return `${prefix}-${String(max + 1).padStart(width, '0')}`;
}

// ── Response mappers (frontend consumes snake_case) ─────────────────────────

const mapCompany = (c, branchCount = 0) => ({
    id: c._id,
    company_code: c.companyCode || '',
    company_name: c.companyName,
    legal_name: c.legalName || '',
    registration_number: c.registrationNumber || '',
    tax_id: c.taxId || '',
    email: c.email || '',
    phone: c.phone || '',
    fax: c.fax || '',
    website: c.website || '',
    address: c.address || '',
    city: c.city || '',
    state: c.state || '',
    country: c.country || '',
    postal_code: c.postalCode || '',
    currency_code: c.currencyCode || '',
    fiscal_year_start: c.fiscalYearStart || '',
    timezone: c.timezone || '',
    is_active: !!c.isActive,
    branch_count: branchCount,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
});

const mapBranch = (b) => {
    const company = b.companyId && typeof b.companyId === 'object' ? b.companyId : null;
    const manager = b.managerId && typeof b.managerId === 'object' ? b.managerId : null;
    return {
        id: b._id,
        branch_code: b.branchCode || '',
        branch_name: b.branchName,
        branch_type: b.branchType,
        company_id: company ? company._id : b.companyId,
        company_name: company ? company.companyName : '',
        manager_id: manager ? manager._id : b.managerId,
        manager_name: manager ? [manager.firstName, manager.lastName].filter(Boolean).join(' ') : '',
        email: b.email || '',
        phone: b.phone || '',
        fax: b.fax || '',
        address: b.address || '',
        city: b.city || '',
        state: b.state || '',
        country: b.country || '',
        postal_code: b.postalCode || '',
        latitude: b.latitude,
        longitude: b.longitude,
        opening_hours: b.openingHours || '',
        is_active: !!b.isActive,
        created_at: b.createdAt,
        updated_at: b.updatedAt,
    };
};

const mapCurrency = (c) => ({
    id: c._id,
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    exchange_rate: c.exchangeRate,
    decimal_places: c.decimalPlaces,
    is_default: !!c.isDefault,
    is_active: !!c.isActive,
    created_at: c.createdAt,
});

const mapTax = (t) => ({
    id: t._id,
    tax_name: t.taxName,
    tax_code: t.taxCode,
    tax_rate: t.taxRate,
    tax_type: t.taxType,
    description: t.description || '',
    is_compound: !!t.isCompound,
    applies_to: t.appliesTo || 'all',
    is_active: !!t.isActive,
    created_at: t.createdAt,
});

const mapTemplate = (t, includeHtml = false) => ({
    id: t._id,
    document_type: t.documentType,
    name: t.name,
    company_id: t.companyId || null,
    is_default: !!t.isDefault,
    is_active: !!t.isActive,
    html_length: (t.htmlContent || '').length,
    ...(includeHtml ? { html_content: t.htmlContent || '' } : {}),
    created_at: t.createdAt,
    updated_at: t.updatedAt,
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Attach branch counts without an N+1 query per company. */
async function branchCountsFor(companyIds) {
    const rows = await Branch.aggregate([
        { $match: { companyId: { $in: companyIds }, isActive: true } },
        { $group: { _id: '$companyId', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
}

/**
 * Get all companies
 * @route GET /api/erp-settings/companies
 */
const getAllCompanies = async (req, res, next) => {
    try {
        const { active, search } = req.query;

        const filter = {};
        if (active !== undefined) filter.isActive = active === 'true';
        if (search) {
            const regex = new RegExp(escapeRegex(search), 'i');
            filter.$or = [{ companyName: regex }, { companyCode: regex }, { email: regex }];
        }

        const companies = await Company.find(filter).sort({ isActive: -1, createdAt: -1 }).lean();
        const counts = await branchCountsFor(companies.map((c) => c._id));

        res.json({
            success: true,
            data: companies.map((c) => mapCompany(c, counts[String(c._id)] || 0)),
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
        if (!toObjectId(id)) throw new AppError('Company not found', 404);

        const company = await Company.findById(id).lean();
        if (!company) throw new AppError('Company not found', 404);

        const branches = await Branch.find({ companyId: company._id })
            .populate('companyId', 'companyName')
            .populate('managerId', 'firstName lastName')
            .sort({ branchType: 1, branchName: 1 })
            .lean();

        res.json({
            success: true,
            data: {
                ...mapCompany(company, branches.filter((b) => b.isActive).length),
                branches: branches.map(mapBranch),
            },
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

        if (!companyName || !String(companyName).trim()) {
            throw new AppError('Company name is required', 400);
        }

        const company = await Company.create({
            companyCode: await nextCode(Company, 'companyCode', 'COM'),
            companyName: String(companyName).trim(),
            legalName: legalName || '',
            registrationNumber: registrationNumber || '',
            taxId: taxId || '',
            email: email || '',
            phone: phone ? normalizePhone(phone) : '',
            fax: fax || '',
            website: website || '',
            address: address || '',
            city: city || '',
            state: state || '',
            country: country || 'Pakistan',
            postalCode: postalCode || '',
            currencyCode: currencyCode || 'PKR',
            fiscalYearStart: fiscalYearStart || '',
            timezone: timezone || 'Asia/Karachi',
            createdBy: req.user?._id || req.user?.id || null,
        });

        res.status(201).json({
            success: true,
            message: 'Company created successfully',
            data: mapCompany(company.toObject(), 0),
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
        if (!toObjectId(id)) throw new AppError('Company not found', 404);

        const company = await Company.findById(id);
        if (!company) throw new AppError('Company not found', 404);

        const {
            companyName, legalName, registrationNumber, taxId,
            email, phone, fax, website, address, city, state,
            country, postalCode, currencyCode, fiscalYearStart, timezone, isActive
        } = req.body;

        const assign = {
            companyName, legalName, registrationNumber, taxId, email, fax, website,
            address, city, state, country, postalCode, currencyCode, fiscalYearStart,
            timezone, isActive,
        };
        let changed = false;
        for (const [key, value] of Object.entries(assign)) {
            if (value !== undefined) { company[key] = value; changed = true; }
        }
        if (phone !== undefined) {
            company.phone = phone ? normalizePhone(phone) : '';
            changed = true;
        }
        if (!changed) throw new AppError('No fields to update', 400);

        company.updatedBy = req.user?._id || req.user?.id || null;
        await company.save();

        res.json({
            success: true,
            message: 'Company updated successfully',
            data: mapCompany(company.toObject()),
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete company (soft delete)
 * @route DELETE /api/erp-settings/companies/:id
 */
const deleteCompany = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!toObjectId(id)) throw new AppError('Company not found', 404);

        const company = await Company.findById(id);
        if (!company) throw new AppError('Company not found', 404);

        await Company.deleteOne({ _id: company._id });

        res.json({ success: true, message: 'Company deleted successfully' });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// BRANCH MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const branchQuery = (filter) => Branch.find(filter)
    .populate('companyId', 'companyName')
    .populate('managerId', 'firstName lastName');

/**
 * Get all branches
 * @route GET /api/erp-settings/branches
 */
const getAllBranches = async (req, res, next) => {
    try {
        const { companyId, branchType, active, search } = req.query;

        const filter = {};
        if (companyId) {
            const cid = toObjectId(companyId);
            if (!cid) return res.json({ success: true, data: [] });
            filter.companyId = cid;
        }
        if (branchType) filter.branchType = branchType;
        if (active !== undefined) filter.isActive = active === 'true';
        if (search) {
            const regex = new RegExp(escapeRegex(search), 'i');
            filter.$or = [{ branchName: regex }, { branchCode: regex }, { city: regex }];
        }

        const branches = await branchQuery(filter).sort({ branchType: 1, branchName: 1 }).lean();

        res.json({ success: true, data: branches.map(mapBranch) });
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
        if (!toObjectId(id)) throw new AppError('Branch not found', 404);

        const branch = await branchQuery({ _id: id }).lean();
        if (!branch.length) throw new AppError('Branch not found', 404);

        res.json({ success: true, data: mapBranch(branch[0]) });
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

        if (!companyId || !branchName || !String(branchName).trim()) {
            throw new AppError('Company ID and branch name are required', 400);
        }
        const cid = toObjectId(companyId);
        if (!cid) throw new AppError('Invalid company ID', 400);

        const company = await Company.findById(cid).select('_id');
        if (!company) throw new AppError('Company not found', 404);

        const branch = await Branch.create({
            branchCode: await nextCode(Branch, 'branchCode', 'BR'),
            companyId: cid,
            branchName: String(branchName).trim(),
            branchType: branchType || 'regional',
            managerId: managerId ? toObjectId(managerId) : null,
            email: email || '',
            phone: phone ? normalizePhone(phone) : '',
            fax: fax || '',
            address: address || '',
            city: city || '',
            state: state || '',
            country: country || 'Pakistan',
            postalCode: postalCode || '',
            latitude: latitude === undefined || latitude === '' ? null : Number(latitude),
            longitude: longitude === undefined || longitude === '' ? null : Number(longitude),
            openingHours: openingHours || '',
            createdBy: req.user?._id || req.user?.id || null,
        });

        const created = await branchQuery({ _id: branch._id }).lean();

        res.status(201).json({
            success: true,
            message: 'Branch created successfully',
            data: mapBranch(created[0]),
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
        if (!toObjectId(id)) throw new AppError('Branch not found', 404);

        const branch = await Branch.findById(id);
        if (!branch) throw new AppError('Branch not found', 404);

        const {
            companyId, branchName, branchType, managerId, email, phone, fax,
            address, city, state, country, postalCode, latitude,
            longitude, openingHours, isActive
        } = req.body;

        const assign = {
            branchName, branchType, email, fax, address, city, state, country,
            postalCode, openingHours, isActive,
        };
        let changed = false;
        for (const [key, value] of Object.entries(assign)) {
            if (value !== undefined) { branch[key] = value; changed = true; }
        }
        if (companyId !== undefined) {
            const cid = toObjectId(companyId);
            if (!cid) throw new AppError('Invalid company ID', 400);
            const exists = await Company.findById(cid).select('_id');
            if (!exists) throw new AppError('Company not found', 404);
            branch.companyId = cid;
            changed = true;
        }
        if (managerId !== undefined) {
            branch.managerId = managerId ? toObjectId(managerId) : null;
            changed = true;
        }
        if (phone !== undefined) { branch.phone = phone ? normalizePhone(phone) : ''; changed = true; }
        if (latitude !== undefined) { branch.latitude = latitude === '' ? null : Number(latitude); changed = true; }
        if (longitude !== undefined) { branch.longitude = longitude === '' ? null : Number(longitude); changed = true; }

        if (!changed) throw new AppError('No fields to update', 400);

        branch.updatedBy = req.user?._id || req.user?.id || null;
        await branch.save();

        const updated = await branchQuery({ _id: branch._id }).lean();

        res.json({
            success: true,
            message: 'Branch updated successfully',
            data: mapBranch(updated[0]),
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete branch (soft delete)
 * @route DELETE /api/erp-settings/branches/:id
 */
const deleteBranch = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!toObjectId(id)) throw new AppError('Branch not found', 404);

        const branch = await Branch.findById(id);
        if (!branch) throw new AppError('Branch not found', 404);

        if (branch.branchType === 'head_office') {
            throw new AppError('Cannot delete head office branch', 400);
        }

        await Branch.deleteOne({ _id: branch._id });

        res.json({ success: true, message: 'Branch deleted successfully' });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

const mapSetting = (s) => ({
    setting_key: s.key,
    setting_value: s.value,
    setting_type: typeof s.value === 'number' ? 'number'
        : typeof s.value === 'boolean' ? 'boolean' : 'string',
    category: s.category || 'general',
    display_name: s.key,
    description: s.description || '',
    is_editable: true,
});

/**
 * Get all settings
 * @route GET /api/erp-settings/settings
 */
const getAllSettings = async (req, res, next) => {
    try {
        const { category } = req.query;

        const filter = {};
        if (category) filter.category = category;

        const rows = await SystemSetting.find(filter).sort({ category: 1, key: 1 }).lean();
        const settings = rows.map(mapSetting);

        const grouped = settings.reduce((acc, setting) => {
            (acc[setting.category] = acc[setting.category] || []).push(setting);
            return acc;
        }, {});

        res.json({ success: true, data: settings, grouped });
    } catch (error) {
        next(error);
    }
};

/**
 * Update settings (bulk upsert)
 * @route PUT /api/erp-settings/settings
 */
const updateSettings = async (req, res, next) => {
    try {
        const { settings } = req.body;

        if (!Array.isArray(settings) || settings.length === 0) {
            throw new AppError('Settings array is required', 400);
        }

        const updated = [];
        for (const setting of settings) {
            if (!setting.key || setting.value === undefined) continue;
            await SystemSetting.findOneAndUpdate(
                { key: setting.key },
                {
                    $set: {
                        value: setting.value,
                        ...(setting.category ? { category: setting.category } : {}),
                        ...(setting.description ? { description: setting.description } : {}),
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
            );
            updated.push(setting.key);
        }

        res.json({
            success: true,
            message: 'Settings updated successfully',
            data: { updated },
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
        const rows = await SystemSetting.aggregate([
            { $group: { _id: '$category', setting_count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]);

        res.json({
            success: true,
            data: rows.map((r) => ({ category: r._id || 'general', setting_count: r.setting_count })),
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// CURRENCY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Seed the base currency so the dropdowns are not empty on a fresh database. */
async function ensureDefaultCurrency() {
    const count = await Currency.estimatedDocumentCount();
    if (count > 0) return;
    await Currency.create({
        code: 'PKR', name: 'Pakistani Rupee', symbol: '₨',
        exchangeRate: 1, decimalPlaces: 2, isDefault: true, isActive: true,
    });
}

/**
 * Get all currencies
 * @route GET /api/erp-settings/currencies
 */
const getAllCurrencies = async (req, res, next) => {
    try {
        await ensureDefaultCurrency();
        const { active } = req.query;

        const filter = {};
        if (active !== undefined) filter.isActive = active === 'true';

        const currencies = await Currency.find(filter).sort({ isDefault: -1, name: 1 }).lean();

        res.json({ success: true, data: currencies.map(mapCurrency) });
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

        const normalizedCode = String(code).trim().toUpperCase();
        const existing = await Currency.findOne({ code: normalizedCode }).select('_id');
        if (existing) throw new AppError('Currency code already exists', 409);

        if (isDefault) {
            await Currency.updateMany({}, { $set: { isDefault: false } });
        }

        const currency = await Currency.create({
            code: normalizedCode,
            name,
            symbol,
            exchangeRate: exchangeRate === undefined || exchangeRate === '' ? 1 : Number(exchangeRate),
            decimalPlaces: decimalPlaces === undefined || decimalPlaces === '' ? 2 : Number(decimalPlaces),
            isDefault: !!isDefault,
            isActive: true,
            createdBy: req.user?._id || req.user?.id || null,
        });

        res.status(201).json({
            success: true,
            message: 'Currency created successfully',
            data: mapCurrency(currency.toObject()),
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
        if (!toObjectId(id)) throw new AppError('Currency not found', 404);

        const currency = await Currency.findById(id);
        if (!currency) throw new AppError('Currency not found', 404);

        const { name, symbol, exchangeRate, decimalPlaces, isDefault, isActive } = req.body;

        let changed = false;
        if (name !== undefined) { currency.name = name; changed = true; }
        if (symbol !== undefined) { currency.symbol = symbol; changed = true; }
        if (exchangeRate !== undefined) { currency.exchangeRate = Number(exchangeRate); changed = true; }
        if (decimalPlaces !== undefined) { currency.decimalPlaces = Number(decimalPlaces); changed = true; }
        if (isActive !== undefined) { currency.isActive = isActive; changed = true; }
        if (isDefault !== undefined) {
            if (isDefault) await Currency.updateMany({ _id: { $ne: currency._id } }, { $set: { isDefault: false } });
            currency.isDefault = isDefault;
            changed = true;
        }
        if (!changed) throw new AppError('No fields to update', 400);

        await currency.save();

        res.json({
            success: true,
            message: 'Currency updated successfully',
            data: mapCurrency(currency.toObject()),
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete currency (soft delete)
 * @route DELETE /api/erp-settings/currencies/:id
 */
const deleteCurrency = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!toObjectId(id)) throw new AppError('Currency not found', 404);

        const currency = await Currency.findById(id);
        if (!currency) throw new AppError('Currency not found', 404);

        if (currency.isDefault) throw new AppError('Cannot delete default currency', 400);

        await Currency.deleteOne({ _id: currency._id });

        res.json({ success: true, message: 'Currency deleted successfully' });
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

        const filter = {};
        if (active !== undefined) filter.isActive = active === 'true';
        if (taxType) filter.taxType = taxType;

        const taxes = await TaxConfig.find(filter).sort({ taxType: 1, taxName: 1 }).lean();

        res.json({ success: true, data: taxes.map(mapTax) });
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

        if (!taxName || !taxCode || taxRate === undefined || taxRate === '') {
            throw new AppError('Tax name, code, and rate are required', 400);
        }

        const normalizedCode = String(taxCode).trim().toUpperCase();
        const existing = await TaxConfig.findOne({ taxCode: normalizedCode }).select('_id');
        if (existing) throw new AppError('Tax code already exists', 409);

        const tax = await TaxConfig.create({
            taxName,
            taxCode: normalizedCode,
            taxRate: Number(taxRate),
            taxType: taxType || 'sales',
            description: description || '',
            isCompound: !!isCompound,
            appliesTo: appliesTo || 'all',
            isActive: true,
            createdBy: req.user?._id || req.user?.id || null,
        });

        res.status(201).json({
            success: true,
            message: 'Tax configuration created successfully',
            data: mapTax(tax.toObject()),
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
        if (!toObjectId(id)) throw new AppError('Tax configuration not found', 404);

        const tax = await TaxConfig.findById(id);
        if (!tax) throw new AppError('Tax configuration not found', 404);

        const { taxName, taxRate, taxType, description, isCompound, appliesTo, isActive } = req.body;

        let changed = false;
        if (taxName !== undefined) { tax.taxName = taxName; changed = true; }
        if (taxRate !== undefined) { tax.taxRate = Number(taxRate); changed = true; }
        if (taxType !== undefined) { tax.taxType = taxType; changed = true; }
        if (description !== undefined) { tax.description = description; changed = true; }
        if (isCompound !== undefined) { tax.isCompound = isCompound; changed = true; }
        if (appliesTo !== undefined) { tax.appliesTo = appliesTo; changed = true; }
        if (isActive !== undefined) { tax.isActive = isActive; changed = true; }
        if (!changed) throw new AppError('No fields to update', 400);

        await tax.save();

        res.json({
            success: true,
            message: 'Tax configuration updated successfully',
            data: mapTax(tax.toObject()),
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete tax configuration (soft delete)
 * @route DELETE /api/erp-settings/taxes/:id
 */
const deleteTax = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!toObjectId(id)) throw new AppError('Tax configuration not found', 404);

        const tax = await TaxConfig.findById(id);
        if (!tax) throw new AppError('Tax configuration not found', 404);

        await TaxConfig.deleteOne({ _id: tax._id });

        res.json({ success: true, message: 'Tax configuration deleted successfully' });
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
        const [
            totalCompanies, activeCompanies,
            totalBranches, activeBranches,
            totalCurrencies, activeCurrencies,
            totalTaxes, activeTaxes,
        ] = await Promise.all([
            Company.countDocuments({}),
            Company.countDocuments({ isActive: true }),
            Branch.countDocuments({}),
            Branch.countDocuments({ isActive: true }),
            Currency.countDocuments({}),
            Currency.countDocuments({ isActive: true }),
            TaxConfig.countDocuments({}),
            TaxConfig.countDocuments({ isActive: true }),
        ]);

        res.json({
            success: true,
            data: {
                total_companies: totalCompanies,
                active_companies: activeCompanies,
                total_branches: totalBranches,
                active_branches: activeBranches,
                total_currencies: totalCurrencies,
                active_currencies: activeCurrencies,
                total_taxes: totalTaxes,
                active_taxes: activeTaxes,
            },
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
        const users = await User.find({ isActive: true })
            .select('firstName lastName email role')
            .populate('role', 'name')
            .sort({ firstName: 1 })
            .lean();

        res.json({
            success: true,
            data: users.map((u) => ({
                id: u._id,
                name: [u.firstName, u.lastName].filter(Boolean).join(' '),
                email: u.email,
                role_name: u.role?.name || '',
            })),
        });
    } catch (error) {
        next(error);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT HTML TEMPLATES (sales print)
// ═══════════════════════════════════════════════════════════════════════════

const ensureDefaultDocumentTemplates = async () => {
    const count = await DocumentTemplate.estimatedDocumentCount();
    if (count > 0) return;
    await DocumentTemplate.insertMany([
        { documentType: 'quotation', name: 'Standard quotation', htmlContent: defaultDocumentTemplates.quotation },
        { documentType: 'booking', name: 'Standard booking', htmlContent: defaultDocumentTemplates.booking },
        { documentType: 'order', name: 'Standard sales order', htmlContent: defaultDocumentTemplates.order },
        { documentType: 'invoice', name: 'Standard invoice (dealer)', htmlContent: defaultDocumentTemplates.invoice },
    ].map((t) => ({ ...t, companyId: null, isDefault: true, isActive: true })));
};

const clearDefaultForScope = async (documentType, companyId) => {
    await DocumentTemplate.updateMany(
        { documentType, companyId: companyId || null },
        { $set: { isDefault: false } }
    );
};

const getAllDocumentTemplates = async (req, res, next) => {
    try {
        await ensureDefaultDocumentTemplates();
        const { documentType, active } = req.query;

        const filter = {};
        if (documentType) {
            if (!DOCUMENT_TEMPLATE_TYPES.has(documentType)) {
                throw new AppError('Invalid document type', 400);
            }
            filter.documentType = documentType;
        }
        if (active !== undefined) filter.isActive = active === 'true';

        const rows = await DocumentTemplate.find(filter)
            .sort({ documentType: 1, isDefault: -1, name: 1 })
            .lean();

        res.json({ success: true, data: rows.map((t) => mapTemplate(t)) });
    } catch (error) {
        next(error);
    }
};

const getDocumentTemplateById = async (req, res, next) => {
    try {
        await ensureDefaultDocumentTemplates();
        const { id } = req.params;
        if (!toObjectId(id)) throw new AppError('Template not found', 404);

        const template = await DocumentTemplate.findById(id).lean();
        if (!template) throw new AppError('Template not found', 404);

        res.json({ success: true, data: mapTemplate(template, true) });
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

        const companyId = req.query.companyId ? toObjectId(req.query.companyId) : null;

        // Company-scoped default wins, then the global default, then anything active.
        let template = null;
        if (companyId) {
            template = await DocumentTemplate.findOne({
                documentType, isActive: true, companyId, isDefault: true,
            }).sort({ createdAt: -1 }).lean();
        }
        if (!template) {
            template = await DocumentTemplate.findOne({
                documentType, isActive: true, companyId: null, isDefault: true,
            }).sort({ createdAt: -1 }).lean();
        }
        if (!template) {
            template = await DocumentTemplate.findOne({ documentType, isActive: true })
                .sort({ isDefault: -1, createdAt: -1 }).lean();
        }

        res.json({ success: true, data: template ? mapTemplate(template, true) : null });
    } catch (error) {
        next(error);
    }
};

const createDocumentTemplate = async (req, res, next) => {
    try {
        const { documentType, name, htmlContent, companyId, isDefault } = req.body;

        if (!DOCUMENT_TEMPLATE_TYPES.has(documentType)) {
            throw new AppError('Invalid document type', 400);
        }
        if (!name || !htmlContent) {
            throw new AppError('Name and htmlContent are required', 400);
        }

        const cid = companyId === undefined || companyId === '' || companyId === null
            ? null
            : toObjectId(companyId);
        if (companyId && !cid) throw new AppError('Invalid company ID', 400);

        if (isDefault) await clearDefaultForScope(documentType, cid);

        const template = await DocumentTemplate.create({
            documentType,
            name,
            htmlContent,
            companyId: cid,
            isDefault: !!isDefault,
            isActive: true,
            createdBy: req.user?._id || req.user?.id || null,
        });

        res.status(201).json({
            success: true,
            message: 'Template created',
            data: mapTemplate(template.toObject()),
        });
    } catch (error) {
        next(error);
    }
};

const updateDocumentTemplate = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!toObjectId(id)) throw new AppError('Template not found', 404);

        const template = await DocumentTemplate.findById(id);
        if (!template) throw new AppError('Template not found', 404);

        const { documentType, name, htmlContent, companyId, isDefault, isActive } = req.body;

        const nextType = documentType || template.documentType;
        if (!DOCUMENT_TEMPLATE_TYPES.has(nextType)) {
            throw new AppError('Invalid document type', 400);
        }

        let cid = template.companyId;
        if (companyId !== undefined) {
            cid = companyId === '' || companyId === null ? null : toObjectId(companyId);
            if (companyId && !cid) throw new AppError('Invalid company ID', 400);
        }

        if (isDefault) await clearDefaultForScope(nextType, cid);

        template.documentType = nextType;
        if (name !== undefined) template.name = name;
        if (htmlContent !== undefined) template.htmlContent = htmlContent;
        template.companyId = cid;
        if (isDefault !== undefined) template.isDefault = !!isDefault;
        if (isActive !== undefined) template.isActive = !!isActive;

        await template.save();

        res.json({ success: true, message: 'Template updated', data: mapTemplate(template.toObject()) });
    } catch (error) {
        next(error);
    }
};

const deleteDocumentTemplate = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!toObjectId(id)) throw new AppError('Template not found', 404);

        const template = await DocumentTemplate.findById(id);
        if (!template) throw new AppError('Template not found', 404);

        await DocumentTemplate.deleteOne({ _id: template._id });

        res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        next(error);
    }
};

const seedDocumentTemplates = async (req, res, next) => {
    try {
        await DocumentTemplate.deleteMany({});
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
    seedDocumentTemplates,
};
