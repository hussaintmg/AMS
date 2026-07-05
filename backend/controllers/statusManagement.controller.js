const getAllStatuses = async (req, res, next) => {
  res.json({ success: true, data: {} });
};

const getStatusesByTable = async (req, res, next) => {
  res.json({ success: true, data: [] });
};

const getStatusById = async (req, res, next) => {
  res.json({ success: false, message: 'Status management not migrated to MongoDB yet' });
};

const createStatus = async (req, res, next) => {
  res.json({ success: false, message: 'Status management not migrated to MongoDB yet' });
};

const updateStatus = async (req, res, next) => {
  res.json({ success: false, message: 'Status management not migrated to MongoDB yet' });
};

const deleteStatus = async (req, res, next) => {
  res.json({ success: false, message: 'Status management not migrated to MongoDB yet' });
};

const reorderStatuses = async (req, res, next) => {
  res.json({ success: false, message: 'Status management not migrated to MongoDB yet' });
};

const getAvailableTables = async (req, res, next) => {
  res.json({ success: true, data: [] });
};

const getStatusAnalytics = async (req, res, next) => {
  res.json({ success: true, data: {} });
};

module.exports = {
  getAllStatuses, getStatusesByTable, getStatusById, createStatus, updateStatus,
  deleteStatus, reorderStatuses, getAvailableTables, getStatusAnalytics,
};
