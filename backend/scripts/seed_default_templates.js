const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { connectMongo, disconnectMongo } = require('../config/mongodb');
const { EmailTemplate, EmailUsage, EmailVariable, PdfTemplate, PdfUsage } = require('../models');
const catalog = require('../data/default-template-catalog.json');
const pdfHtml = require('../constants/defaultDocumentTemplates');

const emailDefs = [
  ['quotation_customer','Quotation ready for {{quotation.number}}','quotation','Your quotation is ready','We prepared your quotation and included the requested vehicle and pricing details.'],
  ['booking_customer','Booking confirmed: {{booking.number}}','booking','Your booking is confirmed','Thank you for choosing us. Your booking has been recorded and our team will coordinate delivery.'],
  ['sales_order_customer','Sales order {{order.number}} received','order','Your sales order is confirmed','Your sales order is now in our system. We will keep you updated about fulfilment and delivery.'],
  ['invoice_customer','Invoice {{invoice.number}} from {{company.name}}','invoice','Your invoice is ready','Please find your invoice summary below. Contact our team if you need any clarification.'],
  ['forgot_password','Reset your {{company.name}} password','auth','Password reset requested','Use the secure link or verification code below to reset your password. This request expires shortly.']
];
const shell = (title, intro, body) => `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#172033"><div style="max-width:640px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 35px #0f172a18"><div style="padding:28px 34px;background:linear-gradient(135deg,#12385d,#2563eb);color:#fff"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.78">AMS ERP</div><h1 style="margin:10px 0 0;font-size:25px">${title}</h1></div><div style="padding:32px 34px"><p style="font-size:16px;line-height:1.6">Hello <strong>{{customer.fullName}}</strong>,</p><p style="font-size:15px;line-height:1.7;color:#475569">${intro}</p>${body}<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">Need help? Contact {{company.phone}}<br/>This is an automated message from {{company.name}}.</div></div></div></body></html>`;
const bodyFor = (type) => type === 'auth' ? `<div style="text-align:center;margin:24px 0"><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px">Verification code</div><div style="display:inline-block;margin:10px 0;padding:14px 28px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;color:#1d4ed8;font-size:28px;font-weight:700;letter-spacing:6px">{{auth.resetCode}}</div><p><a href="{{auth.resetPasswordLink}}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px">Reset password securely</a></p><p style="font-size:13px;color:#64748b">This code/link expires in 60 minutes. If you did not request this, ignore this email.</p></div>` : `<div style="padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px"><div style="font-size:13px;color:#64748b">Document reference</div><strong style="font-size:20px;color:#12385d">{{document.number}}</strong><div style="margin-top:12px;color:#475569">Date: {{document.date}}<br/>Total: <strong>{{document.totalAmount}}</strong><br/>Balance due: <strong>{{document.balanceAmount}}</strong></div></div>`;
async function run() {
  await connectMongo();
  for (const v of catalog.variables) await EmailVariable.findOneAndUpdate({key:v.key},{$set:{...v,description:`Safe template variable: ${v.name}`,isActive:true,isDeleted:false}},{upsert:true,setDefaultsOnInsert:true});
  for (const [key,subject,type,title,intro] of emailDefs) {
    const html=shell(title,intro,bodyFor(type));
    const template=await EmailTemplate.findOneAndUpdate({templateName:title},{$set:{subject,html,plainText:html.replace(/<[^>]+>/g,' '),description:`Default ${type} email template`,tags:['default',type],isActive:true,status:'published',isDeleted:false}},{upsert:true,new:true,setDefaultsOnInsert:true});
    await EmailUsage.findOneAndUpdate({key},{$set:{key,name:title,description:`Default ${type} notification`,template:template._id,isActive:true,isDeleted:false}},{upsert:true,setDefaultsOnInsert:true});
  }
  const htmlByType={quotation:pdfHtml.quotation,booking:pdfHtml.booking,order:pdfHtml.order,invoice:pdfHtml.invoice};
  for(const def of catalog.pdfTemplates){const template=await PdfTemplate.findOneAndUpdate({documentType:def.documentType,name:def.name},{$set:{description:def.description,status:'active',designData:{pages:[{config:{format:'A4',width:794,height:1123},elements:[{id:'html',type:'text',text:htmlByType[def.documentType],css:[]}] }]} }},{upsert:true,new:true,setDefaultsOnInsert:true});await PdfUsage.findOneAndUpdate({documentType:def.documentType},{$set:{label:def.documentType==='order'?'Sales Order':def.documentType[0].toUpperCase()+def.documentType.slice(1),template:template._id}},{upsert:true});}
  console.log('Default email/PDF templates and safe variables seeded.'); await disconnectMongo();
}
run().catch(async e=>{console.error(e);await disconnectMongo();process.exitCode=1;});
