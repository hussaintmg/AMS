const sender = require('../services/emailSender.service');
const renderer = require('../services/emailRenderer.service');
const AppError = require('../utils/AppError');

exports.sendTest = async (req, res, next) => {
  try {
    const { email, usageKey, context, variables, templateId, subject, html, text } = req.body;
    const ctx = context || variables || {};

    if (!email) throw new AppError('Recipient email is required', 400);

    let renderedSubject = subject || 'Test Email';
    let renderedHtml = html || '<p>Test email content</p>';
    let renderedText = text || '';
    let renderedUsageId = null;
    let renderedTemplateId = templateId || null;
    let renderedVars = {};

    if (usageKey) {
      const rendered = await renderer.renderEmail(usageKey, ctx, { templateId });
      renderedSubject = rendered.subject;
      renderedHtml = rendered.html;
      renderedText = rendered.text;
      renderedUsageId = rendered.usage?._id || null;
      renderedTemplateId = rendered.template?._id || renderedTemplateId;
      renderedVars = rendered.resolvedVars || {};
    } else if (templateId) {
      const { EmailTemplate } = require('../models');
      const template = await EmailTemplate.findOne({ _id: templateId, isDeleted: false }).lean();
      if (template) {
        const rendered = await renderer.renderWithTemplate(template, null, ctx);
        renderedSubject = rendered.subject;
        renderedHtml = rendered.html;
        renderedText = rendered.text;
        renderedTemplateId = template._id;
        renderedVars = rendered.resolvedVars || ctx;
      }
    }

    const result = await sender.sendTestEmail({
      to: email,
      subject: renderedSubject,
      html: renderedHtml,
      text: renderedText,
      sentBy: req.user?.id,
      usageId: renderedUsageId,
      templateId: renderedTemplateId,
      resolvedVars: renderedVars,
    });

    res.json({
      success: result.status === 'sent',
      message: result.status === 'sent' ? 'Test email sent successfully' : 'Failed to send test email',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
