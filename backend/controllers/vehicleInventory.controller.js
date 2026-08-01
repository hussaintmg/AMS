const Vehicle = require('../models/Vehicle.model');
const { VehicleMake, VehicleModel, VehicleVariant, VehicleColor } = require('../models/VehicleMaster.model');
const Warehouse = require('../models/Warehouse.model');
const SalesOrder = require('../models/SalesOrder.model');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { nextBarcode } = require('../utils/barcode');

/** Next free VEH-NNNNN code. Scans the highest existing rather than counting,
 *  so a deleted vehicle can never cause a duplicate. */
async function nextVehicleCode() {
    const latest = await Vehicle.find({ vehicleCode: /^VEH-\d+$/ })
        .select('vehicleCode').sort({ vehicleCode: -1 }).limit(1).lean();
    const match = latest[0]?.vehicleCode?.match(/^VEH-(\d+)$/);
    let next = match ? Number(match[1]) + 1 : 1;
    for (let attempt = 0; attempt < 1000; attempt += 1) {
        const candidate = `VEH-${String(next).padStart(5, '0')}`;
        if (!(await Vehicle.exists({ vehicleCode: candidate }))) return candidate;
        next += 1;
    }
    throw new Error('Could not allocate a free vehicle code');
}

const VALID_SORT_COLUMNS = {
    created_at: 'createdAt',
    vin: 'vin',
    year: 'year',
    selling_price: 'salePrice',
    purchase_price: 'purchasePrice',
    status: 'status',
    arrival_date: 'arrivalDate'
};

const resolveIdToField = async (Model, id, fieldName) => {
    if (!id) return null;
    try {
        const doc = await Model.findById(id).select(fieldName).lean();
        return doc ? doc[fieldName] : null;
    } catch {
        return null;
    }
};

const batchResolveIds = async (vehicles) => {
    const makeNames = [...new Set(vehicles.map(v => v.make?.name).filter(Boolean))];
    const modelNames = [...new Set(vehicles.map(v => v.model?.name).filter(Boolean))];
    const variantNames = [...new Set(vehicles.map(v => v.variant?.name).filter(Boolean))];
    const colorNames = [...new Set(vehicles.map(v => v.color?.name).filter(Boolean))];
    const warehouseNames = [...new Set(vehicles.map(v => v.warehouse?.name).filter(Boolean))];

    const [makes, models, variants, colors, warehouses] = await Promise.all([
        makeNames.length ? VehicleMake.find({ name: { $in: makeNames }, is_active: true }).select('name').lean() : [],
        modelNames.length ? VehicleModel.find({ name: { $in: modelNames }, is_active: true }).select('name').lean() : [],
        variantNames.length ? VehicleVariant.find({ name: { $in: variantNames }, is_active: true }).select('name').lean() : [],
        colorNames.length ? VehicleColor.find({ name: { $in: colorNames }, is_active: true }).select('name').lean() : [],
        warehouseNames.length ? Warehouse.find({ warehouseName: { $in: warehouseNames }, isActive: true }).select('warehouseName').lean() : []
    ]);

    return {
        makeMap: Object.fromEntries(makes.map(m => [m.name, m._id])),
        modelMap: Object.fromEntries(models.map(m => [m.name, m._id])),
        variantMap: Object.fromEntries(variants.map(v => [v.name, v._id])),
        colorMap: Object.fromEntries(colors.map(c => [c.name, c._id])),
        warehouseMap: Object.fromEntries(warehouses.map(w => [w.warehouseName, w._id]))
    };
};

const mapVehicleFlat = (v, idMaps) => ({
    id: v._id,
    vin: v.vin,
    chassis_number: v.chassisNumber || v.vin || '',
    engine_number: v.engineNumber,
    barcode: v.barcode || '',
    // Make + Model + Variant; legacy/imported vehicles without master names
    // must still show an identifying label (chassis/engine), never blank.
    vehicle_name: [v.make?.name, v.model?.name, v.variant?.name].filter(Boolean).join(' ')
        || v.chassisNumber || v.vin || v.engineNumber || '',
    year: v.year,
    status: v.status,
    condition_type: v.conditionType,
    mileage: v.mileage,
    purchase_price: v.purchasePrice,
    selling_price: v.salePrice,
    make_name: v.make?.name || '',
    model_name: v.model?.name || '',
    variant_name: v.variant?.name || '',
    color_name: v.color?.name || '',
    color_hex: v.color?.hexCode || '',
    warehouse_name: v.warehouse?.name || '',
    location: v.location,
    arrival_date: v.arrivalDate,
    notes: v.notes,
    is_stock_out: Boolean(v.isStockOut),
    stock_out_date: v.stockOutDate || null,
    // ── Dispatch evidence (Dealer Pro Dispatch Report) ──
    is_dispatched: Boolean(v.dispatch?.dispatchNo),
    dispatch_no: v.dispatch?.dispatchNo || '',
    dispatch_date: v.dispatch?.dispatchDate || null,
    dispatch_pbo_no: v.dispatch?.pboNo || '',
    dispatch_invoice_no: v.dispatch?.invoiceNo || '',
    dispatch_sap_order_no: v.dispatch?.sapOrderNo || '',
    dispatch_transport_company: v.dispatch?.transportCompany || '',
    dispatch_builty_no: v.dispatch?.builtyNo || '',
    dispatch_ship_from: v.dispatch?.shipFrom || '',
    dispatch_ship_to: v.dispatch?.shipTo || '',
    dispatch_sales_order_id: v.dispatch?.salesOrder || null,
    dispatch_source: v.dispatch?.source || '',
    created_at: v.createdAt,
    make_id: idMaps.makeMap[v.make?.name] || null,
    model_id: idMaps.modelMap[v.model?.name] || null,
    variant_id: idMaps.variantMap[v.variant?.name] || null,
    color_id: idMaps.colorMap[v.color?.name] || null,
    warehouse_id: idMaps.warehouseMap[v.warehouse?.name] || null
});

const getAllVehicles = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            status = '',
            makeId = '',
            modelId = '',
            year = '',
            warehouseId = '',
            conditionType = '',
            dispatchStatus = '',
            sortBy = 'created_at',
            sortOrder = 'DESC'
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        const matchFilter = { isActive: true };

        if (makeId) {
            const make = await VehicleMake.findById(makeId).select('name').lean();
            if (make) {
                matchFilter['make.name'] = make.name;
            }
        }

        if (modelId) {
            const model = await VehicleModel.findById(modelId).select('name').lean();
            if (model) {
                matchFilter['model.name'] = model.name;
            }
        }

        if (warehouseId) {
            const wh = await Warehouse.findById(warehouseId).select('warehouseName').lean();
            if (wh) {
                matchFilter['warehouse.name'] = wh.warehouseName;
            }
        }

        if (status) {
            matchFilter.status = status;
        }

        if (year) {
            matchFilter.year = parseInt(year);
        }

        if (conditionType) {
            matchFilter.conditionType = conditionType;
        }

        // dispatched   → has dispatch evidence from the Dispatch Report
        // not_dispatched → still in stock, never dispatched
        if (dispatchStatus === 'dispatched') {
            matchFilter['dispatch.dispatchNo'] = { $exists: true, $nin: [null, ''] };
        } else if (dispatchStatus === 'not_dispatched') {
            matchFilter['dispatch.dispatchNo'] = { $in: [null, ''] };
        }

        if (search) {
            const regex = new RegExp(search, 'i');
            matchFilter.$or = [
                { vin: regex },
                { chassisNumber: regex },
                { engineNumber: regex },
                { 'make.name': regex },
                { 'model.name': regex },
                { 'variant.name': regex },
                { 'dispatch.dispatchNo': regex },
                { 'dispatch.pboNo': regex }
            ];
        }

        const total = await Vehicle.countDocuments(matchFilter);

        const sortField = VALID_SORT_COLUMNS[sortBy] || 'createdAt';
        const sortDir = sortOrder.toUpperCase() === 'ASC' ? 1 : -1;

        const vehicles = await Vehicle.find(matchFilter)
            .sort({ [sortField]: sortDir })
            .skip(offset)
            .limit(limitNum)
            .lean();

        const idMaps = await batchResolveIds(vehicles);

        const result = vehicles.map(v => mapVehicleFlat(v, idMaps));

        res.json({
            success: true,
            data: {
                vehicles: result,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum)
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching vehicles:', error);
        next(error);
    }
};

const getVehicleById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const vehicle = await Vehicle.findOne({ _id: id, isActive: true }).lean();

        if (!vehicle) {
            throw new AppError('Vehicle not found', 404);
        }

        const idMaps = await batchResolveIds([vehicle]);
        const flat = mapVehicleFlat(vehicle, idMaps);

        const salesOrders = await SalesOrder.find({ vehicle: id })
            .select('orderNumber status totalAmount orderDate')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const mappedOrders = salesOrders.map(so => ({
            id: so._id,
            order_number: so.orderNumber,
            status: so.status,
            grand_total: so.totalAmount,
            order_date: so.orderDate
        }));

        res.json({
            success: true,
            data: {
                ...flat,
                salesOrders: mappedOrders,
                auditHistory: []
            }
        });
    } catch (error) {
        logger.error('Error fetching vehicle:', error);
        next(error);
    }
};

const createVehicle = async (req, res, next) => {
    try {
        const {
            vin, engineNumber, variantId, colorId, year,
            status, conditionType, mileage, purchasePrice, sellingPrice,
            location, warehouseId, arrivalDate, notes
        } = req.body;

        if (!vin) throw new AppError('VIN is required', 400);
        if (!engineNumber) throw new AppError('Engine Number is required', 400);
        if (!variantId) throw new AppError('Variant is required', 400);
        if (!colorId) throw new AppError('Color is required', 400);
        if (!year) throw new AppError('Year is required', 400);
        if (!purchasePrice) throw new AppError('Purchase Price is required', 400);
        if (!sellingPrice) throw new AppError('Selling Price is required', 400);

        const existingVin = await Vehicle.findOne({ vin: vin.toUpperCase().trim() }).lean();
        if (existingVin) {
            throw new AppError('VIN already exists', 400);
        }

        const existingEngine = await Vehicle.findOne({ engineNumber: engineNumber.trim() }).lean();
        if (existingEngine) {
            throw new AppError('Engine Number already exists', 400);
        }

        const variant = await VehicleVariant.findById(variantId).lean();
        if (!variant) {
            throw new AppError('Invalid variant selection', 400);
        }

        const vehicleModel = await VehicleModel.findById(variant.model_id).lean();
        if (!vehicleModel) {
            throw new AppError('Invalid model selection', 400);
        }

        const vehicleMake = await VehicleMake.findById(vehicleModel.make_id).lean();
        if (!vehicleMake) {
            throw new AppError('Invalid make selection', 400);
        }

        const color = await VehicleColor.findById(colorId).lean();
        if (!color) {
            throw new AppError('Invalid color selection', 400);
        }

        let warehouseData = {};
        if (warehouseId) {
            const warehouse = await Warehouse.findById(warehouseId).lean();
            if (warehouse) {
                warehouseData = {
                    name: warehouse.warehouseName,
                    code: warehouse.code
                };
            }
        }

        const vehicleData = {
            // Mongoose validates before the schema's pre-save hook can fill this
            // in, so the code is allocated here — without it every create failed
            // with "Vehicle code is required".
            vehicleCode: await nextVehicleCode(),
            vin: vin.toUpperCase().trim(),
            chassisNumber: vin.toUpperCase().trim(),
            engineNumber: engineNumber.trim(),
            year: parseInt(year),
            status: status || 'at_yard',
            conditionType: conditionType || 'new',
            mileage: parseInt(mileage) || 0,
            purchasePrice: parseFloat(purchasePrice),
            salePrice: parseFloat(sellingPrice),
            location: location || 'Main Yard',
            arrivalDate: arrivalDate || null,
            notes: notes || '',
            isActive: true,
            createdBy: req.user?.id || null,
            make: {
                name: vehicleMake.name,
                code: vehicleMake.name.substring(0, 3).toUpperCase(),
                country: vehicleMake.country || ''
            },
            model: {
                name: vehicleModel.name,
                code: vehicleModel.name.substring(0, 3).toUpperCase(),
                yearFrom: vehicleModel.year,
                yearTo: vehicleModel.year
            },
            variant: {
                name: variant.name,
                code: variant.name.substring(0, 3).toUpperCase(),
                engineType: variant.specifications?.engineType || '',
                transmission: vehicleModel.transmission || '',
                fuelType: vehicleModel.fuel_type || '',
                price: variant.base_price
            },
            color: {
                name: color.name,
                code: color.name.substring(0, 3).toUpperCase(),
                hexCode: color.hex_code
            },
            warehouse: warehouseData,
            // Every new unit is scannable from the moment it exists.
            barcode: await nextBarcode(Vehicle, 'vehicle'),
        };

        const newVehicle = await Vehicle.create(vehicleData);

        logger.info(`Vehicle created: ${vin} by ${req.user?.email || 'system'}`);

        // Selling below cost is a real (clearance) scenario, so it is allowed —
        // but it is surfaced rather than saved silently.
        const warnings = [];
        if (newVehicle.salePrice < newVehicle.purchasePrice) {
            warnings.push(
                `Selling price (${newVehicle.salePrice}) is below the purchase price (${newVehicle.purchasePrice}) — this vehicle will book a loss.`
            );
        }

        res.status(201).json({
            success: true,
            message: 'Vehicle created successfully',
            warnings,
            data: {
                id: newVehicle._id,
                vin: newVehicle.vin
            }
        });
    } catch (error) {
        logger.error('Error creating vehicle:', error);
        next(error);
    }
};

const updateVehicle = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            vin, engineNumber, variantId, colorId, year, conditionType,
            mileage, purchasePrice, sellingPrice, location,
            warehouseId, arrivalDate, notes
        } = req.body;

        const vehicle = await Vehicle.findById(id);
        if (!vehicle || !vehicle.isActive) {
            throw new AppError('Vehicle not found', 404);
        }

        if (vin && vin.toUpperCase().trim() !== vehicle.vin) {
            const existingVin = await Vehicle.findOne({ vin: vin.toUpperCase().trim(), _id: { $ne: id } }).lean();
            if (existingVin) {
                throw new AppError('VIN already exists', 400);
            }
        }

        if (engineNumber && engineNumber.trim() !== vehicle.engineNumber) {
            const existingEngine = await Vehicle.findOne({ engineNumber: engineNumber.trim(), _id: { $ne: id } }).lean();
            if (existingEngine) {
                throw new AppError('Engine Number already exists', 400);
            }
        }

        if (vin) vehicle.vin = vin.toUpperCase().trim();
        if (engineNumber) vehicle.engineNumber = engineNumber.trim();
        if (year) vehicle.year = parseInt(year);
        if (conditionType) vehicle.conditionType = conditionType;
        if (mileage !== undefined && mileage !== '') vehicle.mileage = parseInt(mileage) || 0;
        if (purchasePrice !== undefined && purchasePrice !== '') vehicle.purchasePrice = parseFloat(purchasePrice);
        if (sellingPrice !== undefined && sellingPrice !== '') vehicle.salePrice = parseFloat(sellingPrice);
        if (location) vehicle.location = location;
        if (notes !== undefined) vehicle.notes = notes;
        if (arrivalDate !== undefined) vehicle.arrivalDate = arrivalDate || null;

        if (variantId) {
            const variant = await VehicleVariant.findById(variantId).lean();
            if (!variant) {
                throw new AppError('Invalid variant selection', 400);
            }
            const vehicleModel = await VehicleModel.findById(variant.model_id).lean();
            if (!vehicleModel) {
                throw new AppError('Invalid model selection', 400);
            }
            const vehicleMake = await VehicleMake.findById(vehicleModel.make_id).lean();
            if (!vehicleMake) {
                throw new AppError('Invalid make selection', 400);
            }
            vehicle.make = {
                name: vehicleMake.name,
                code: vehicleMake.name.substring(0, 3).toUpperCase(),
                country: vehicleMake.country || ''
            };
            vehicle.model = {
                name: vehicleModel.name,
                code: vehicleModel.name.substring(0, 3).toUpperCase(),
                yearFrom: vehicleModel.year,
                yearTo: vehicleModel.year
            };
            vehicle.variant = {
                name: variant.name,
                code: variant.name.substring(0, 3).toUpperCase(),
                engineType: variant.specifications?.engineType || '',
                transmission: vehicleModel.transmission || '',
                fuelType: vehicleModel.fuel_type || '',
                price: variant.base_price
            };
        }

        if (colorId) {
            const color = await VehicleColor.findById(colorId).lean();
            if (!color) {
                throw new AppError('Invalid color selection', 400);
            }
            vehicle.color = {
                name: color.name,
                code: color.name.substring(0, 3).toUpperCase(),
                hexCode: color.hex_code
            };
        }

        if (warehouseId !== undefined) {
            if (warehouseId === '' || warehouseId === null) {
                vehicle.warehouse = {};
            } else {
                const warehouse = await Warehouse.findById(warehouseId).lean();
                if (warehouse) {
                    vehicle.warehouse = {
                        name: warehouse.warehouseName,
                        code: warehouse.code
                    };
                }
            }
        }

        vehicle.updatedBy = req.user?.id || null;
        await vehicle.save();

        logger.info(`Vehicle updated: ID ${id} by ${req.user?.email || 'system'}`);
        res.json({ success: true, message: 'Vehicle updated successfully' });
    } catch (error) {
        logger.error('Error updating vehicle:', error);
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern || {})[0] || 'field';
            return res.status(400).json({ success: false, message: `Duplicate value for ${field}` });
        }
        next(error);
    }
};

const deleteVehicle = async (req, res, next) => {
    try {
        const { id } = req.params;

        const vehicle = await Vehicle.findById(id);
        if (!vehicle || !vehicle.isActive) {
            throw new AppError('Vehicle not found', 404);
        }

        await Vehicle.deleteOne({ _id: vehicle._id });

        logger.info(`Vehicle deleted: ID ${id} by ${req.user?.email || 'system'}`);
        res.json({ success: true, message: 'Vehicle deleted successfully' });
    } catch (error) {
        logger.error('Error deleting vehicle:', error);
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const updateVehicleStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) throw new AppError('Status is required', 400);

        const vehicle = await Vehicle.findById(id);
        if (!vehicle || !vehicle.isActive) {
            throw new AppError('Vehicle not found', 404);
        }

        vehicle.status = status;
        vehicle.updatedBy = req.user?.id || null;
        await vehicle.save();

        logger.info(`Vehicle ID ${id} status updated to ${status}`);
        res.json({ success: true, message: 'Vehicle status updated successfully' });
    } catch (error) {
        logger.error('Error updating vehicle status:', error);
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const getVehicleStats = async (req, res, next) => {
    try {
        const overallResult = await Vehicle.aggregate([
            { $match: { isActive: true } },
            {
                $group: {
                    _id: null,
                    total_vehicles: { $sum: 1 },
                    in_transit: {
                        $sum: { $cond: [{ $eq: ['$status', 'in_transit'] }, 1, 0] }
                    },
                    at_yard: {
                        $sum: { $cond: [{ $eq: ['$status', 'at_yard'] }, 1, 0] }
                    },
                    allocated: {
                        $sum: { $cond: [{ $eq: ['$status', 'allocated'] }, 1, 0] }
                    },
                    sold: {
                        $sum: { $cond: [{ $eq: ['$status', 'sold'] }, 1, 0] }
                    },
                    delivered: {
                        $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
                    },
                    total_purchase_value: { $sum: '$purchasePrice' },
                    total_selling_value: { $sum: '$salePrice' },
                    total_profit_margin: {
                        $sum: { $subtract: [{ $ifNull: ['$salePrice', 0] }, { $ifNull: ['$purchasePrice', 0] }] }
                    }
                }
            }
        ]);

        const overall = overallResult[0] || {
            total_vehicles: 0,
            in_transit: 0,
            at_yard: 0,
            allocated: 0,
            sold: 0,
            delivered: 0,
            total_purchase_value: 0,
            total_selling_value: 0,
            total_profit_margin: 0
        };
        delete overall._id;

        const byMake = await Vehicle.aggregate([
            {
                $match: {
                    isActive: true,
                    status: { $nin: ['sold', 'delivered'] }
                }
            },
            {
                $group: {
                    _id: '$make.name',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            {
                $project: {
                    _id: 0,
                    make_name: '$_id',
                    count: 1
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                ...overall,
                byMake
            }
        });
    } catch (error) {
        logger.error('Error fetching vehicle stats:', error);
        next(error);
    }
};

const getWarehouses = async (req, res, next) => {
    try {
        const warehouses = await Warehouse.find({ isActive: true })
            .select('warehouseName code')
            .sort({ warehouseName: 1 })
            .lean();

        const result = warehouses.map(w => ({
            id: w._id,
            name: w.warehouseName,
            code: w.code
        }));

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Error fetching warehouses:', error);
        next(error);
    }
};

const getMakesList = async (req, res, next) => {
    try {
        const makes = await VehicleMake.find({ is_active: true })
            .sort({ name: 1 })
            .lean();

        const result = makes.map(m => ({
            id: m._id,
            name: m.name,
            country: m.country,
            logo: m.logo
        }));

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Error fetching makes:', error);
        next(error);
    }
};

const getModelsList = async (req, res, next) => {
    try {
        const { makeId } = req.query;

        const filter = { is_active: true };
        if (makeId) {
            filter.make_id = makeId;
        }

        const models = await VehicleModel.find(filter)
            .sort({ name: 1 })
            .lean();

        const result = models.map(m => ({
            id: m._id,
            name: m.name,
            year: m.year,
            body_type: m.body_type,
            fuel_type: m.fuel_type,
            transmission: m.transmission,
            make_id: m.make_id
        }));

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Error fetching models:', error);
        next(error);
    }
};

const getVariantsList = async (req, res, next) => {
    try {
        const { modelId } = req.query;

        const filter = { is_active: true };
        if (modelId) {
            filter.model_id = modelId;
        }

        const variants = await VehicleVariant.find(filter)
            .sort({ name: 1 })
            .lean();

        const result = variants.map(v => ({
            id: v._id,
            name: v.name,
            base_price: v.base_price,
            features: v.features,
            model_id: v.model_id
        }));

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Error fetching variants:', error);
        next(error);
    }
};

const getColorsList = async (req, res, next) => {
    try {
        const colors = await VehicleColor.find({ is_active: true })
            .sort({ name: 1 })
            .lean();

        const result = colors.map(c => ({
            id: c._id,
            name: c.name,
            hex_code: c.hex_code,
            is_metallic: c.is_metallic,
            additional_cost: c.additional_cost
        }));

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Error fetching colors:', error);
        next(error);
    }
};

module.exports = {
    getAllVehicles,
    getVehicleById,
    createVehicle,
    updateVehicle,
    deleteVehicle,
    updateVehicleStatus,
    getVehicleStats,
    getWarehouses,
    getMakesList,
    getModelsList,
    getVariantsList,
    getColorsList
};
