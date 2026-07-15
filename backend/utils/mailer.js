const nodemailer = require('nodemailer');
const logger = require('./logger');
const { decrypt } = require('./crypto');
const { EmailConfig } = require('../models');

const getSmtpConfig = async () => {
  try {
    const config = await EmailConfig.findOne({ key: 'smtp' }).lean();
    if (!config) return null;

    const host = config.host || process.env.SMTP_HOST || process.env.MAIL_HOST;
    if (!host) return null;

    const port = Number(config.port || process.env.SMTP_PORT || process.env.MAIL_PORT || 587);
    const username = config.username || process.env.SMTP_USER || process.env.MAIL_USER;
    const password = config.password ? decrypt(config.password) : (process.env.SMTP_PASS || process.env.MAIL_PASS);
    const encryption = config.encryption || 'tls';

    return {
      host,
      port,
      secure: encryption === 'ssl' || port === 465,
      auth: username && password ? { user: username, pass: password } : undefined,
      tls: encryption === 'tls' ? { rejectUnauthorized: false } : undefined,
      senderName: config.senderName || '',
      senderEmail: config.senderEmail || process.env.MAIL_FROM || process.env.SMTP_FROM || '',
      replyTo: config.replyTo || process.env.MAIL_REPLY_TO || process.env.SMTP_REPLY_TO || '',
    };
  } catch (error) {
    logger.warn(`[Mailer] Failed to load SMTP config from DB: ${error.message}`);
    return null;
  }
};

const getTransporter = async () => {
  const smtpConfig = await getSmtpConfig();
  const host = smtpConfig?.host || process.env.SMTP_HOST || process.env.MAIL_HOST;
  const port = Number(smtpConfig?.port || process.env.SMTP_PORT || process.env.MAIL_PORT || 587);
  const user = smtpConfig?.auth?.user || process.env.SMTP_USER || process.env.MAIL_USER;
  const pass = smtpConfig?.auth?.pass || process.env.SMTP_PASS || process.env.MAIL_PASS;

  if (!host) {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: smtpConfig?.secure ?? (port === 465),
    auth: user && pass ? { user, pass } : undefined,
    tls: smtpConfig?.tls || undefined,
  });
};

const sendMail = async ({ to, subject, html, text, from: overrideFrom, replyTo: overrideReplyTo }) => {
  const smtpConfig = await getSmtpConfig();
  const fromAddress = overrideFrom || (smtpConfig?.senderEmail
    ? `${smtpConfig.senderName || 'AMS'} <${smtpConfig.senderEmail}>`
    : (process.env.MAIL_FROM || process.env.SMTP_FROM || 'AMS <no-reply@ams.local>'));
  const replyTo = overrideReplyTo || smtpConfig?.replyTo || process.env.MAIL_REPLY_TO || process.env.SMTP_REPLY_TO;

  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: fromAddress,
    to,
    subject,
    html,
    text,
    ...(replyTo ? { replyTo } : {}),
  });

  if (info.message) {
    logger.info('Email rendered with jsonTransport because SMTP is not configured');
  }

  return info;
};

module.exports = {
  sendMail,
};
