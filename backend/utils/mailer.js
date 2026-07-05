const nodemailer = require('nodemailer');
const logger = require('./logger');

const getTransporter = () => {
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587);
  const user = process.env.SMTP_USER || process.env.MAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.MAIL_PASS;

  if (!host) {
    return nodemailer.createTransport({
      jsonTransport: true
    });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined
  });
};

const sendMail = async ({ to, subject, html, text }) => {
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || 'AMS <no-reply@ams.local>';
  const info = await getTransporter().sendMail({ from, to, subject, html, text });

  if (info.message) {
    logger.info('Email rendered with jsonTransport because SMTP is not configured');
  }

  return info;
};

module.exports = {
  sendMail
};
