const User = require('../models/User.model');
const Customer = require('../models/Customer.model');
const Lead = require('../models/Lead.model');
const Employee = require('../models/Employee.model');

const idOf = (value) => value?._id || value?.id || value;

/** Keep intentionally denormalized contact/employee snapshots synchronized. */
async function syncFromUser(user, actorId = user?._id) {
  const userId = idOf(user);
  if (!userId) return;
  const updatedBy = actorId || userId;

  await Employee.updateMany({ user: userId }, { $set: {
    firstName: user.firstName || '', lastName: user.lastName || '',
    email: user.email || '', phone: user.phone || '',
    department: user.department ? idOf(user.department) : null,
    role: user.role ? idOf(user.role) : null,
    designation: user.designation || '', isActive: user.isActive !== false,
    status: user.status || (user.isActive === false ? 'inactive' : 'active'), updatedBy,
  } });

  const linkedCustomerIds = new Set();
  if (user.customer) linkedCustomerIds.add(String(idOf(user.customer)));
  const linkedCustomers = await Customer.find({ user: userId }).select('_id').lean();
  linkedCustomers.forEach((customer) => linkedCustomerIds.add(String(customer._id)));
  if (!linkedCustomerIds.size) return;

  const customerIds = [...linkedCustomerIds];
  await Customer.updateMany({ _id: { $in: customerIds } }, { $set: {
    firstName: user.firstName || '', lastName: user.lastName || '',
    email: user.email || '', phone: user.phone || '',
    department: user.department ? idOf(user.department) : null, updatedBy,
    isActive: user.isActive !== false,
  } });

  const customerDocs = await Customer.find({ _id: { $in: customerIds } }).select('_id firstName lastName email phone').lean();
  await Promise.all(customerDocs.map((customer) => Lead.updateMany(
    { convertedCustomerId: customer._id },
    { $set: {
      customerName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
      email: customer.email || '', phone: customer.phone || '', updatedBy,
    } },
  )));
}

/** Sync the linked user/employee and converted lead after a customer edit. */
async function syncFromCustomer(customer, actorId, { syncStatus = false } = {}) {
  if (!customer?._id) return;
  const updatedBy = actorId || customer.updatedBy || null;
  const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
  const fields = {
    firstName: customer.firstName || '', lastName: customer.lastName || '',
    fullName,
    email: customer.email || '', phone: customer.phone || '',
    isActive: customer.isActive !== false,
    updatedBy,
  };
  if (syncStatus) fields.status = customer.isActive === false ? 'inactive' : 'active';
  // Customer department is optional; do not clear an existing user department
  // just because an unrelated customer edit submitted a null department.
  if (customer.department) fields.department = idOf(customer.department);
  const linkedUserId = customer.user ? idOf(customer.user) : null;
  if (linkedUserId) {
    await User.updateOne({ _id: linkedUserId }, { $set: fields });
    const employeeFields = {
      firstName: fields.firstName, lastName: fields.lastName,
      email: fields.email, phone: fields.phone,
      isActive: fields.isActive, updatedBy,
    };
    if (syncStatus) employeeFields.status = fields.status;
    if (fields.department) employeeFields.department = fields.department;
    await Employee.updateMany({ user: linkedUserId }, { $set: employeeFields });
  }
  await Lead.updateMany({ convertedCustomerId: customer._id }, { $set: {
    customerName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
    email: customer.email || '', phone: customer.phone || '', updatedBy,
  } });
}

module.exports = { syncFromUser, syncFromCustomer };
