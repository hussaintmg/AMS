const { pendingList, pendingObject, pendingStats } = require('../utils/mongoPendingResponse');

exports.getStats = (req, res) => pendingStats(res, 'Service Master');
exports.getServiceTypes = (req, res) => pendingList(res, 'Service Master');
exports.createServiceType = (req, res) => pendingObject(res, 'Service Master');
exports.updateServiceType = (req, res) => pendingObject(res, 'Service Master');
exports.deleteServiceType = (req, res) => pendingObject(res, 'Service Master');
exports.getLaborRates = (req, res) => pendingList(res, 'Service Master');
exports.createLaborRate = (req, res) => pendingObject(res, 'Service Master');
exports.updateLaborRate = (req, res) => pendingObject(res, 'Service Master');
exports.deleteLaborRate = (req, res) => pendingObject(res, 'Service Master');
exports.getServicePackages = (req, res) => pendingList(res, 'Service Master');
exports.getServicePackage = (req, res) => pendingObject(res, 'Service Master');
exports.createServicePackage = (req, res) => pendingObject(res, 'Service Master');
exports.updateServicePackage = (req, res) => pendingObject(res, 'Service Master');
exports.deleteServicePackage = (req, res) => pendingObject(res, 'Service Master');
exports.addPackageItem = (req, res) => pendingObject(res, 'Service Master');
exports.removePackageItem = (req, res) => pendingObject(res, 'Service Master');

// Route aliases
exports.getPackageById = exports.getServicePackage;
exports.createPackage = exports.createServicePackage;
exports.updatePackage = exports.updateServicePackage;
exports.deletePackage = exports.deleteServicePackage;

exports.getWarrantyTypes = (req, res) => pendingList(res, 'Service Master');
exports.createWarrantyType = (req, res) => pendingObject(res, 'Service Master');
exports.updateWarrantyType = (req, res) => pendingObject(res, 'Service Master');
exports.deleteWarrantyType = (req, res) => pendingObject(res, 'Service Master');

// Route aliases
exports.getWarranties = exports.getWarrantyTypes;
exports.createWarranty = exports.createWarrantyType;
exports.updateWarranty = exports.updateWarrantyType;
exports.deleteWarranty = exports.deleteWarrantyType;

exports.getCategories = (req, res) => pendingList(res, 'Service Master');
