const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const forgotPasswordEmailTemplate = ({ firstName, lastName, code, expiresInMinutes = 60 }) => {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'there';
  const safeName = escapeHtml(fullName);
  const safeCode = escapeHtml(code);

  return {
    subject: 'Your AMS password reset code',
    text: `Hi ${fullName},\n\nUse this code to reset your AMS password: ${code}\n\nThis code expires in ${expiresInMinutes} minutes. If you did not request this, you can safely ignore this email.\n\nAMS Team`,
    html: `
      <div style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe7f1;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:28px 32px;background:#102a43;color:#ffffff;">
                    <div style="font-size:20px;font-weight:700;line-height:1.3;">AMS Password Reset</div>
                    <div style="font-size:13px;opacity:.82;margin-top:6px;">Auto Management System</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">Hi ${safeName},</p>
                    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#42526e;">Use the verification code below to continue resetting your password.</p>
                    <div style="letter-spacing:8px;font-size:34px;font-weight:700;text-align:center;background:#eef4fb;border:1px solid #c9d8e8;border-radius:10px;padding:18px 12px;color:#102a43;">${safeCode}</div>
                    <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#5f6f86;">This code expires in ${expiresInMinutes} minutes. If you did not request a password reset, no action is needed.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 32px;background:#f8fafc;color:#7b8794;font-size:12px;line-height:1.5;">This is an automated AMS security email.</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `
  };
};

module.exports = forgotPasswordEmailTemplate;
