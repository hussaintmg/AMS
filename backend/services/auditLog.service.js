// Redirect to unified Log service
const logService = require('./log.service');

const saveAuditLog = async () => Promise.resolve(null);
const queryAuditLogs = async (filters = {}) => logService.queryLogs(filters);
const getAuditLogById = async (id) => logService.getLogById(id);
const deleteAuditLog = async (id) => logService.deleteLog(id);
const getAuditLogStats = async (filters = {}) => logService.getLogStats(filters);

module.exports = { saveAuditLog, queryAuditLogs, getAuditLogById, deleteAuditLog, getAuditLogStats };
