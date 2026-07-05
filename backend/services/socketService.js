const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { getPermissionSettings } = require('../utils/permissionResolver');

const JWT_SECRET = process.env.JWT_SECRET || 'ams_super_secret_key';

let io = null;

const connectedUsers = new Map();

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (origin.match(/^http:\/\/localhost:\d+$/)) {
          return callback(null, true);
        }
        const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [];
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        callback(null, true);
      },
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = String(decoded.id || decoded.userId);
      socket.userRole = decoded.role || '';
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    connectedUsers.set(userId, { socketId: socket.id, connectedAt: new Date() });
    logger.info(`Socket connected: user=${userId} socket=${socket.id}`);

    socket.join(`user:${userId}`);

    socket.on('disconnect', () => {
      connectedUsers.delete(userId);
      logger.info(`Socket disconnected: user=${userId} socket=${socket.id}`);
    });

    socket.on('subscribe:logs', () => {
      socket.join('logs');
    });

    socket.on('unsubscribe:logs', () => {
      socket.leave('logs');
    });
  });

  logger.info('Socket.IO initialized');
  return io;
};

const getIO = () => io;

const emitLogEvent = (event, payload) => {
  if (!io) return;
  io.to('logs').emit(event, payload);
};

const emitToUser = (userId, event, payload) => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
};

module.exports = {
  initSocket,
  getIO,
  emitLogEvent,
  emitToUser,
  connectedUsers,
};
