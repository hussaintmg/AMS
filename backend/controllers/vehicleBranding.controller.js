const VehicleBrand = require('../models/VehicleBrand.model');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const toBrandJSON = (brand) => ({
    id: brand._id,
    name: brand.name,
    description: brand.description,
    logo_url: brand.logo_url,
    country_of_origin: brand.country_of_origin,
    established_year: brand.established_year,
    website: brand.website,
    is_active: brand.is_active,
    display_order: brand.display_order,
    created_at: brand.created_at,
    updated_at: brand.updated_at,
    total_makes: 0,
    total_vehicles: 0
});

const getAllBrands = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            is_active,
            sortBy = 'display_order',
            sortOrder = 'ASC'
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const filter = { deleted_at: null };

        if (search && search.trim() !== '') {
            filter.$or = [
                { name: { $regex: search.trim(), $options: 'i' } },
                { description: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        if (is_active !== undefined) {
            filter.is_active = is_active === 'true';
        }

        const validSortFields = ['name', 'display_order', 'created_at', 'is_active'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'display_order';
        const sortDir = sortOrder.toUpperCase() === 'DESC' ? -1 : 1;
        const sort = { [sortField]: sortDir, name: 1 };

        const [brands, total] = await Promise.all([
            VehicleBrand.find(filter).sort(sort).skip(skip).limit(limitNum),
            VehicleBrand.countDocuments(filter)
        ]);

        res.json({
            success: true,
            status: 200,
            message: 'Brands retrieved successfully',
            data: {
                brands: brands.map(toBrandJSON),
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum)
                }
            }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error fetching brands: ${error.message}`);
        next(new AppError(`Failed to fetch brands: ${error.message}`, 500));
    }
};

const getBrandById = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!id) {
            return next(new AppError('Invalid brand ID', 400));
        }

        const brand = await VehicleBrand.findOne({ _id: id, deleted_at: null });

        if (!brand) {
            return next(new AppError('Brand not found', 404));
        }

        res.json({
            success: true,
            status: 200,
            message: 'Brand retrieved successfully',
            data: { brand: toBrandJSON(brand) }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error fetching brand by ID: ${error.message}`);
        next(new AppError(`Failed to fetch brand: ${error.message}`, 500));
    }
};

const createBrand = async (req, res, next) => {
    try {
        const {
            name,
            description,
            logo_url,
            country_of_origin,
            established_year,
            website
        } = req.body;

        if (!name || name.trim() === '') {
            return next(new AppError('Brand name is required', 400));
        }

        const duplicate = await VehicleBrand.findOne({
            name: { $regex: `^${name.trim()}$`, $options: 'i' },
            deleted_at: null
        });

        if (duplicate) {
            return next(new AppError('Brand name already exists', 400));
        }

        const brand = await VehicleBrand.create({
            name: name.trim(),
            description: description || '',
            logo_url: logo_url || '',
            country_of_origin: country_of_origin || '',
            established_year: established_year || null,
            website: website || '',
            created_by: req.user?.id || null,
            updated_by: req.user?.id || null
        });

        res.status(201).json({
            success: true,
            status: 201,
            message: 'Brand created successfully',
            data: { brand: toBrandJSON(brand) }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error creating brand: ${error.message}`);
        next(new AppError(`Failed to create brand: ${error.message}`, 500));
    }
};

const updateBrand = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            name,
            description,
            logo_url,
            country_of_origin,
            established_year,
            website,
            is_active,
            display_order
        } = req.body;

        if (!id) {
            return next(new AppError('Invalid brand ID', 400));
        }

        if (!name || name.trim() === '') {
            return next(new AppError('Brand name is required', 400));
        }

        const existing = await VehicleBrand.findOne({ _id: id, deleted_at: null });

        if (!existing) {
            return next(new AppError('Brand not found', 404));
        }

        const duplicate = await VehicleBrand.findOne({
            name: { $regex: `^${name.trim()}$`, $options: 'i' },
            _id: { $ne: id },
            deleted_at: null
        });

        if (duplicate) {
            return next(new AppError('Brand name already exists', 400));
        }

        const updated = await VehicleBrand.findByIdAndUpdate(
            id,
            {
                name: name.trim(),
                description: description || '',
                logo_url: logo_url || '',
                country_of_origin: country_of_origin || '',
                established_year: established_year || null,
                website: website || '',
                is_active: is_active !== undefined ? is_active : true,
                display_order: display_order || 0,
                updated_by: req.user?.id || null
            },
            { new: true }
        );

        res.json({
            success: true,
            status: 200,
            message: 'Brand updated successfully',
            data: { brand: toBrandJSON(updated) }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error updating brand: ${error.message}`);
        next(new AppError(`Failed to update brand: ${error.message}`, 500));
    }
};

const deleteBrand = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!id) {
            return next(new AppError('Invalid brand ID', 400));
        }

        const brand = await VehicleBrand.findOne({ _id: id, deleted_at: null });

        if (!brand) {
            return next(new AppError('Brand not found', 404));
        }

        await VehicleBrand.findByIdAndUpdate(id, { deleted_at: new Date() });

        res.json({
            success: true,
            status: 200,
            message: 'Brand deleted successfully',
            data: { brandId: id }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error deleting brand: ${error.message}`);
        next(new AppError(`Failed to delete brand: ${error.message}`, 500));
    }
};

const getActiveBrands = async (req, res, next) => {
    try {
        const brands = await VehicleBrand.find({ is_active: true, deleted_at: null })
            .sort({ display_order: 1, name: 1 })
            .select('name logo_url country_of_origin');

        res.json({
            success: true,
            status: 200,
            message: 'Active brands retrieved successfully',
            data: {
                brands: brands.map((b) => ({
                    id: b._id,
                    name: b.name,
                    logo_url: b.logo_url,
                    country_of_origin: b.country_of_origin
                }))
            }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error fetching active brands: ${error.message}`);
        next(new AppError(`Failed to fetch active brands: ${error.message}`, 500));
    }
};

const getBrandStats = async (req, res, next) => {
    try {
        const [total, active, inactive] = await Promise.all([
            VehicleBrand.countDocuments({ deleted_at: null }),
            VehicleBrand.countDocuments({ is_active: true, deleted_at: null }),
            VehicleBrand.countDocuments({ is_active: false, deleted_at: null })
        ]);

        res.json({
            success: true,
            status: 200,
            message: 'Statistics retrieved successfully',
            data: {
                stats: { total, active, inactive }
            }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error fetching statistics: ${error.message}`);
        next(new AppError(`Failed to fetch statistics: ${error.message}`, 500));
    }
};

const bulkUpdateStatus = async (req, res, next) => {
    try {
        const { brandIds, is_active } = req.body;

        if (!Array.isArray(brandIds) || brandIds.length === 0) {
            return next(new AppError('No brand IDs provided', 400));
        }

        const result = await VehicleBrand.updateMany(
            { _id: { $in: brandIds }, deleted_at: null },
            { is_active: !!is_active, updated_by: req.user?.id || null }
        );

        res.json({
            success: true,
            status: 200,
            message: `${result.modifiedCount} brands updated successfully`,
            data: { updatedCount: result.modifiedCount }
        });
    } catch (error) {
        logger.error(`[Vehicle Branding] Error bulk updating status: ${error.message}`);
        next(new AppError(`Failed to update brands: ${error.message}`, 500));
    }
};

module.exports = {
    getAllBrands,
    getBrandById,
    createBrand,
    updateBrand,
    deleteBrand,
    getActiveBrands,
    getBrandStats,
    bulkUpdateStatus
};
