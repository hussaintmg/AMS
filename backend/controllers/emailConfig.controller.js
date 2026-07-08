const sender = require('../services/emailSender.service');
const AppError = require('../utils/AppError');
const { EmailConfig } = require('../models');

const getUserId = (req) => req.user?.id || req.user?._id;

exports.getConfig = async (req, res, next) => {
  try {
    const config = await sender.getSmtpConfig();
    res.json({ success: true, data: { config } });
  } catch (error) {
    next(error);
  }
};

exports.saveConfig = async (req, res, next) => {
  try {
    const { host, port, encryption, username, password, senderName, senderEmail, replyTo } = req.body;

    const update = {};
    if (host !== undefined) update.host = host;
    if (port !== undefined) update.port = Number(port);
    if (encryption !== undefined) update.encryption = encryption;
    if (username !== undefined) update.username = username;
    if (password !== undefined) update.password = password;
    if (senderName !== undefined) update.senderName = senderName;
    if (senderEmail !== undefined) update.senderEmail = senderEmail;
    if (replyTo !== undefined) update.replyTo = replyTo;

    const config = await sender.saveSmtpConfig(update, getUserId(req));

    res.json({ success: true, message: 'SMTP configuration saved', data: { config } });
  } catch (error) {
    next(error);
  }
};

exports.testConnection = async (req, res, next) => {
  try {
    let config = await EmailConfig.findOne({ key: 'smtp' }).lean();
    if (!config) throw new AppError('No SMTP configuration found. Save configuration first.', 400);

    const result = await sender.testSmtpConnection(config);
    res.json({ success: result.success, message: result.message, data: result });
  } catch (error) {
    next(error);
  }
};
