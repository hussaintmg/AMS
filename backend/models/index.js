const Role = require('./Role.model');
const User = require('./User.model');
const Customer = require('./Customer.model');
const Lead = require('./Lead.model');
const Vehicle = require('./Vehicle.model');
const Part = require('./Part.model');
const Warehouse = require('./Warehouse.model');
const Quotation = require('./Quotation.model');
const Booking = require('./Booking.model');
const SalesOrder = require('./SalesOrder.model');
const Invoice = require('./Invoice.model');
const Payment = require('./Payment.model');
const ServiceAppointment = require('./ServiceAppointment.model');
const JobCard = require('./JobCard.model');
const Employee = require('./Employee.model');
const Payroll = require('./Payroll.model');
const Leave = require('./Leave.model');
const Expense = require('./Expense.model');
const LedgerEntry = require('./LedgerEntry.model');
const SystemSetting = require('./SystemSetting.model');
const ActivityLog = require('./ActivityLog.model');
const FileUpload = require('./FileUpload.model');
const BrandingAsset = require('./BrandingAsset.model');
const ServerConfig = require('./ServerConfig.model');
const Page = require('./Page.model');
const BrandingSetting = require('./BrandingSetting.model');
const Department = require('./Department.model');
const Log = require('./mongo/Log.model');
// ApiLog and AuditLog are deprecated — use single Log model instead
// const ApiLog = require('./ApiLog.model');
// const AuditLog = require('./AuditLog.model');

module.exports = {
  Role,
  User,
  Customer,
  Lead,
  Vehicle,
  Part,
  Warehouse,
  Quotation,
  Booking,
  SalesOrder,
  Invoice,
  Payment,
  ServiceAppointment,
  JobCard,
  Employee,
  Payroll,
  Leave,
  Expense,
  LedgerEntry,
  SystemSetting,
  ActivityLog,
  FileUpload,
  BrandingAsset,
  ServerConfig,
  Page,
  BrandingSetting,
  Department,
  Log,
  // ApiLog,
  // AuditLog
};
