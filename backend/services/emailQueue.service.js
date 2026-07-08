const { EmailQueue, EmailLog, EmailUsage } = require('../models');
const { sendMail } = require('../utils/mailer');
const logger = require('../utils/logger');
const renderer = require('./emailRenderer.service');

const QUEUE_INTERVAL = 5000;
let queueTimer = null;
let isProcessing = false;

function startQueue() {
  if (queueTimer) return;
  logger.info('[EmailQueue] Queue started');
  processNext();
}

function stopQueue() {
  if (queueTimer) {
    clearTimeout(queueTimer);
    queueTimer = null;
  }
  logger.info('[EmailQueue] Queue stopped');
}

async function enqueue({ to, cc, bcc, subject, html, text, usageKey, templateId, contextData, attachments }) {
  const doc = await EmailQueue.create({
    to,
    cc: cc || [],
    bcc: bcc || [],
    subject,
    html,
    text,
    usageKey: usageKey || '',
    templateId: templateId || null,
    contextData: contextData || {},
    attachments: attachments || [],
    status: 'pending',
  });
  processNext();
  return doc;
}

async function processNext() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const items = await EmailQueue.find({ status: 'pending', retryCount: { $lt: 3 } })
      .sort({ createdAt: 1 })
      .limit(5);

    if (items.length === 0) {
      queueTimer = setTimeout(processNext, QUEUE_INTERVAL);
      return;
    }

    await Promise.all(items.map(item => processItem(item)));
  } catch (err) {
    logger.error('[EmailQueue] Error processing queue:', err.message);
  } finally {
    isProcessing = false;
    queueTimer = setTimeout(processNext, QUEUE_INTERVAL);
  }
}

async function processItem(item) {
  const startTime = Date.now();
  let rendered = null;
  let subject = item.subject;
  let html = item.html;
  let text = item.text;
  let templateId = item.templateId;
  let usageId = null;

  try {
    await EmailQueue.findByIdAndUpdate(item._id, { status: 'sending' });

    if (item.usageKey) {
      rendered = await renderer.renderEmail(item.usageKey, item.contextData || {}, { templateId: item.templateId || undefined });
      subject = rendered.subject;
      html = rendered.html;
      text = rendered.text;
      templateId = rendered.template?._id || templateId;
      usageId = rendered.usage?._id || null;
    }

    const info = await sendMail({
      to: item.to,
      cc: item.cc.length > 0 ? item.cc.join(', ') : undefined,
      bcc: item.bcc.length > 0 ? item.bcc.join(', ') : undefined,
      subject,
      html,
      text,
    });

    await EmailQueue.findByIdAndUpdate(item._id, {
      status: 'sent',
      errorMessage: '',
    });

    const usage = usageId ? { _id: usageId } : (item.usageKey
      ? await EmailUsage.findOne({ key: item.usageKey, isDeleted: false }).select('_id').lean().catch(() => null)
      : null);

    await EmailLog.create({
      recipient: item.to,
      cc: item.cc || [],
      bcc: item.bcc || [],
      subject,
      renderedSubject: subject,
      renderedHtml: html,
      usage: usage?._id || null,
      template: templateId || null,
      status: 'sent',
      providerResponse: info.messageId || JSON.stringify(info),
      attachments: item.attachments || [],
      renderedVariables: rendered?.resolvedVars || item.contextData || {},
      executionTime: Date.now() - startTime,
    });

    logger.info(`[EmailQueue] Sent email to ${item.to}: ${subject}`);
  } catch (err) {
    const newRetryCount = (item.retryCount || 0) + 1;
    const status = newRetryCount >= 3 ? 'failed' : 'pending';

    await EmailQueue.findByIdAndUpdate(item._id, {
      status,
      retryCount: newRetryCount,
      errorMessage: err.message,
    });

    if (status === 'failed') {
      const usage = item.usageKey
        ? await EmailUsage.findOne({ key: item.usageKey, isDeleted: false }).select('_id').lean().catch(() => null)
        : null;

      await EmailLog.create({
        recipient: item.to,
        cc: item.cc || [],
        bcc: item.bcc || [],
        subject,
        renderedSubject: subject,
        renderedHtml: html,
        usage: usage?._id || null,
        template: templateId || null,
        status: 'failed',
        attachments: item.attachments || [],
        renderedVariables: rendered?.resolvedVars || item.contextData || {},
        executionTime: Date.now() - startTime,
        errorMessage: err.message,
      });
    }

    if (status === 'failed') {
      logger.error(`[EmailQueue] Failed to send email to ${item.to} after ${newRetryCount} retries: ${err.message}`);
    } else {
      logger.warn(`[EmailQueue] Retry ${newRetryCount}/3 for ${item.to}: ${err.message}`);
    }
  }
}

async function getQueueStats() {
  const [pending, sending, sent, failed] = await Promise.all([
    EmailQueue.countDocuments({ status: 'pending' }),
    EmailQueue.countDocuments({ status: 'sending' }),
    EmailQueue.countDocuments({ status: 'sent' }),
    EmailQueue.countDocuments({ status: 'failed' }),
  ]);
  return { pending, sending, sent, failed, total: pending + sending + sent + failed };
}

async function retryFailed() {
  const result = await EmailQueue.updateMany(
    { status: 'failed', retryCount: { $lt: 3 } },
    { $set: { status: 'pending', retryCount: 0, errorMessage: '' } }
  );
  processNext();
  return result;
}

async function retryOne(id) {
  await EmailQueue.findByIdAndUpdate(id, {
    status: 'pending',
    retryCount: 0,
    errorMessage: '',
  });
  processNext();
}

async function clearSent() {
  await EmailQueue.deleteMany({ status: 'sent' });
}

module.exports = {
  startQueue,
  stopQueue,
  enqueue,
  getQueueStats,
  retryFailed,
  retryOne,
  clearSent,
};
