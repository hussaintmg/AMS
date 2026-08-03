const Role = require('./Role.model');
const User = require('./User.model');
const Customer = require('./Customer.model');
const Lead = require('./Lead.model');
const Vehicle = require('./Vehicle.model');
const Part = require('./Part.model');
const PartSourceType = require('./PartSourceType.model');
const Warehouse = require('./Warehouse.model');
const Quotation = require('./Quotation.model');
const Booking = require('./Booking.model');
const SalesOrder = require('./SalesOrder.model');
const Invoice = require('./Invoice.model');
// Parts sales live in their own collections so they never mix with the vehicle
// documents above; see controllers/partsSales.controller.js.
const PartQuotation = require('./PartQuotation.model');
const PartBooking = require('./PartBooking.model');
const PartSalesOrder = require('./PartSalesOrder.model');
const PartInvoice = require('./PartInvoice.model');
const Payment = require('./Payment.model');
const PaymentMethod = require('./PaymentMethod.model');
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
const StatusCollection = require('./StatusCollection.model');
const StatusItem = require('./StatusItem.model');
const LeadSource = require('./LeadSource.model');
const LeadType = require('./LeadType.model');
const LeadPriority = require('./LeadPriority.model');
const LeadCity = require('./LeadCity.model');
const EmailTemplate = require('./EmailTemplate.model');
const EmailTemplateVersion = require('./EmailTemplateVersion.model');
const EmailUsage = require('./EmailUsage.model');
const EmailLog = require('./EmailLog.model');
const EmailQueue = require('./EmailQueue.model');
const EmailAsset = require('./EmailAsset.model');
const EmailComponent = require('./EmailComponent.model');
const EmailVariable = require('./EmailVariable.model');
const EmailConfig = require('./EmailConfig.model');
const PdfTemplate = require('./PdfTemplate.model');
const PdfUsage = require('./PdfUsage.model');
const PdfVariable = require('./PdfVariable.model');
const Notification = require('./Notification.model');
const SearchDocument = require('./SearchDocument.model');
const SearchAnalytics = require('./SearchAnalytics.model');
const SearchHistory = require('./SearchHistory.model');
const SearchConfig = require('./SearchConfig.model');
const { VehicleMake, VehicleModel, VehicleVariant, VehicleColor, PartCategory, Supplier } = require('./VehicleMaster.model');
const { Company, Branch, Currency, TaxConfig, DocumentTemplate } = require('./ErpSettings.model');

module.exports = {
  Role,
  User,
  Customer,
  Lead,
  Vehicle,
  Part,
  PartSourceType,
  Warehouse,
  Quotation,
  Booking,
  SalesOrder,
  Invoice,
  PartQuotation,
  PartBooking,
  PartSalesOrder,
  PartInvoice,
  Payment,
  PaymentMethod,
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
  StatusCollection,
  StatusItem,
  LeadSource,
  LeadType,
  LeadPriority,
  LeadCity,
  EmailTemplate,
  EmailTemplateVersion,
  EmailUsage,
  EmailLog,
  EmailQueue,
  EmailAsset,
  EmailComponent,
  EmailVariable,
  EmailConfig,
  PdfTemplate,
  PdfUsage,
  PdfVariable,
  Notification,
  SearchDocument,
  SearchAnalytics,
  SearchHistory,
  SearchConfig,
  VehicleMake,
  VehicleModel,
  VehicleVariant,
  VehicleColor,
  PartCategory,
  Supplier,
  Company,
  Branch,
  Currency,
  TaxConfig,
  DocumentTemplate,
};
