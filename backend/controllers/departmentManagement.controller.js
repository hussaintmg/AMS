const getAllDepartments = async (req, res, next) => {
  res.json({ success: true, data: [] });
};

const getDepartmentById = async (req, res, next) => {
  res.json({ success: false, message: 'Departments not migrated to MongoDB yet' });
};

const createDepartment = async (req, res, next) => {
  res.json({ success: false, message: 'Departments not migrated to MongoDB yet' });
};

const updateDepartment = async (req, res, next) => {
  res.json({ success: false, message: 'Departments not migrated to MongoDB yet' });
};

const deleteDepartment = async (req, res, next) => {
  res.json({ success: false, message: 'Departments not migrated to MongoDB yet' });
};

const assignManager = async (req, res, next) => {
  res.json({ success: false, message: 'Departments not migrated to MongoDB yet' });
};

const getDepartmentStats = async (req, res, next) => {
  res.json({ success: true, data: { total: 0 } });
};

module.exports = {
  getAllDepartments, getDepartmentById, createDepartment, updateDepartment,
  deleteDepartment, assignManager, getDepartmentStats,
};
