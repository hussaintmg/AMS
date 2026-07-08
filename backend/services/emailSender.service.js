const { EmailConfig, EmailLog } = require('../models');
const { sendMail } = require('../utils/mailer');
const { encrypt, decrypt } = require('../utils/crypto');
const logger = require('../utils/logger');
const renderer = require('./emailRenderer.service');
const queueService = require('./emailQueue.service');

async function sendTemplateEmail({ usageKey, context, to, cc, bcc, attachments, sentBy }) {
  const rendered = await renderer.renderEmail(usageKey, context);

  const result = await sendRawEmail({
    to,
    cc,
    bcc,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    attachments: attachments || [],
    sentBy,
    usageKey,
    usageId: rendered.usage?._id,
    templateId: rendered.template?._id,
    resolvedVars: rendered.resolvedVars,
  });

  return result;
}

async function sendRawEmail({ to, cc, bcc, subject, html, text, attachments, sentBy, usageKey, usageId, templateId, resolvedVars }) {
  const startTime = Date.now();

  let providerResponse = '';
  let status = 'sent';
  let errorMessage = '';

  try {
    const config = await EmailConfig.findOne({ key: 'smtp' }).lean();

    const mailOptions = {
      to,
      subject,
      html,
      text,
    };

    if (cc && cc.length > 0) mailOptions.cc = cc.join(', ');
    if (bcc && bcc.length > 0) mailOptions.bcc = bcc.join(', ');

    const info = await sendMail(mailOptions);
    providerResponse = info.messageId || JSON.stringify(info);
  } catch (err) {
    status = 'failed';
    errorMessage = err.message;
    logger.error(`[EmailSender] Failed to send email: ${err.message}`);
  }

  const executionTime = Date.now() - startTime;

  await EmailLog.create({
    recipient: to,
    cc: cc || [],
    bcc: bcc || [],
    subject,
    renderedSubject: subject,
    renderedHtml: html,
    usage: usageId || null,
    template: templateId || null,
    status,
    providerResponse,
    attachments: attachments || [],
    renderedVariables: resolvedVars || {},
    executionTime,
    errorMessage,
    sentBy: sentBy || null,
  });

  logger.info(`[EmailSender] Email ${status} to ${to} in ${executionTime}ms`);

  return { status, executionTime, messageId: providerResponse, errorMessage };
}

async function sendTestEmail({ to, subject, html, text, sentBy, usageId, templateId, resolvedVars }) {
  return sendRawEmail({
    to,
    subject,
    html,
    text,
    sentBy,
    usageId,
    templateId,
    resolvedVars: { _test: true, ...(resolvedVars || {}) },
  });
}

async function getSmtpConfig() {
  let config = await EmailConfig.findOne({ key: 'smtp' }).lean();
  if (!config) {
    config = await EmailConfig.create({ key: 'smtp' });
    config = config.toObject();
  }
  if (config.password) {
    config.password = decrypt(config.password);
  }
  return config;
}

async function saveSmtpConfig(data, userId) {
  const update = { ...data, updatedBy: userId };

  if (update.password) {
    update.password = encrypt(update.password);
  }

  const config = await EmailConfig.findOneAndUpdate(
    { key: 'smtp' },
    { $set: update },
    { upsert: true, returnDocument: 'after', new: true }
  );

  return config;
}

async function testSmtpConnection(config) {
  const nodemailer = require('nodemailer');

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: Number(config.port),
    secure: config.encryption === 'ssl',
    auth: config.username && config.password
      ? { user: config.username, pass: decrypt(config.password) }
      : undefined,
    tls: config.encryption === 'tls' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await transporter.verify();
    return { success: true, message: 'SMTP connection successful' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = {
  sendTemplateEmail,
  sendRawEmail,
  sendTestEmail,
  getSmtpConfig,
  saveSmtpConfig,
  testSmtpConnection,
};
