// Redirect to unified Log service
const logService = require('./log.service');

const saveApiLog = async (payload) => {
  const { logApiEvent } = require('../utils/apiLogger');
  return logApiEvent(payload);
};

const queryApiLogs = async (filters = {}) => logService.queryLogs(filters);
const getApiLogById = async (id) => logService.getLogById(id);
const deleteApiLog = async (id) => logService.deleteLog(id);
const getApiLogStats = async (filters = {}) => logService.getLogStats(filters);

module.exports = { saveApiLog, queryApiLogs, getApiLogById, deleteApiLog, getApiLogStats };
