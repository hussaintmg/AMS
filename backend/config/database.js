/**
 * MySQL database stub — MongoDB migration in progress.
 * All MySQL-dependent routes return safe empty responses.
 * Remove this file after all legacy SQL imports are removed.
 */
const logger = require('../utils/logger');

const noopQuery = async () => [];
const noopTransaction = async () => {};

const query = async () => {
  logger.warn('MySQL query called but database is disabled (MongoDB migration in progress)');
  return [];
};

const executeQuery = async () => [];

const getFirstResult = async () => null;

const callProcedure = async () => [];

const testConnection = async () => {
  logger.warn('MySQL testConnection skipped — MongoDB is the active database');
};

const beginTransaction = noopTransaction;
const commitTransaction = noopTransaction;
const rollbackTransaction = noopTransaction;

const pool = null;

module.exports = {
  pool,
  query,
  executeQuery,
  getFirstResult,
  callProcedure,
  testConnection,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
};
