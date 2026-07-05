const logService = require('../services/log.service');

const queryLogs = async (req, res, next) => {
  try {
    console.log('queryLogs called with query:', req.query);
    console.log("=".repeat(80));
    const result = await logService.queryLogs(req.query, req.user);
    console.log('result:', result);
    res.json({
      success: true,
      message: 'Logs fetched successfully',
      data: {
        logs: result.logs,
        pagination: result.pagination,
        filters: result.filters,
        filterVersion: result.filterVersion,
        filterVersionChanged: result.filterVersionChanged,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getLogById = async (req, res, next) => {
  try {
    const log = await logService.getLogById(req.params.id, req.user);
    if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
    res.json({ success: true, data: log });
  } catch (error) {
    next(error);
  }
};

const deleteLog = async (req, res, next) => {
  try {
    const log = await logService.deleteLog(req.params.id);
    if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
    res.json({ success: true, message: 'Log deleted', data: log });
  } catch (error) {
    next(error);
  }
};

const getLogStats = async (req, res, next) => {
  try {
    const stats = await logService.getLogStats(req.query, req.user);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

const getFilterOptions = async (req, res, next) => {
  try {
    const options = await logService.getFilterOptions(req.user);
    res.json({ success: true, data: options });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  queryLogs,
  getLogById,
  deleteLog,
  getLogStats,
  getFilterOptions,
};
