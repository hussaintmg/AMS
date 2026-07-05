const mongoose = require('mongoose');
const logger = require('../utils/logger');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;
const MONGO_DEBUG = process.env.MONGO_DEBUG === 'true';

const connectMongo = async () => {
  try {
    if (MONGO_DEBUG) {
      mongoose.set('debug', true);
    }

    const conn = await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME
    });

    logger.info(`MongoDB connected: ${conn.connection.host}/${MONGO_DB_NAME}`);

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    return conn;
  } catch (error) {
    logger.error('MongoDB connection failed:', error.message);
    throw error;
  }
};

const disconnectMongo = async () => {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected gracefully');
  } catch (error) {
    logger.error('MongoDB disconnect error:', error.message);
  }
};

const isMongoConnected = () => {
  return mongoose.connection.readyState === 1;
};

module.exports = {
  connectMongo,
  disconnectMongo,
  isMongoConnected,
  mongoose
};
