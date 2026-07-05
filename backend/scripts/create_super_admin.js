const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/amserp';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'amserp';

const SUPER_ADMIN_ROLE = {
  name: 'super_admin',
  displayName: 'Super Admin',
  description: 'Full system access',
  permissions: [],
  count: 0,
  editable: false,
  isActive: true
};

const getRequiredEnv = (key) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
};

const validateConfig = () => {
  const email = getRequiredEnv('SUPER_ADMIN_EMAIL').toLowerCase();
  const password = getRequiredEnv('SUPER_ADMIN_PASSWORD');
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME?.trim() || 'Super';
  const lastName = process.env.SUPER_ADMIN_LAST_NAME?.trim() || 'Admin';
  const phone = process.env.SUPER_ADMIN_PHONE?.trim() || '';

  if (password.length < 8) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 characters long');
  }

  return { email, password, firstName, lastName, phone };
};

async function createSuperAdmin() {
  try {
    const { email, password, firstName, lastName, phone } = validateConfig();

    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, { dbName: MONGO_DB_NAME });
    console.log('Connected to MongoDB.');

    const { Role, User } = require('../models');

    console.log('Ensuring super admin role...');
    let superAdminRole = await Role.findOne({ name: SUPER_ADMIN_ROLE.name });
    if (!superAdminRole) {
      superAdminRole = await Role.create(SUPER_ADMIN_ROLE);
      console.log('Super admin role created.');
    } else {
      superAdminRole.editable = false;
      superAdminRole.isActive = true;
      await superAdminRole.save();
      console.log('Super admin role already exists.');
    }

    const existingUser = await User.findOne({ email }).select('+password');

    if (existingUser) {
      console.log(`User ${email} already exists. Updating super admin account...`);
      existingUser.password = password;
      existingUser.firstName = firstName;
      existingUser.lastName = lastName;
      existingUser.phone = phone;
      existingUser.role = superAdminRole._id;
      existingUser.isActive = true;
      await existingUser.save();
      console.log('Super admin updated successfully.');
    } else {
      console.log(`Creating new super admin: ${email}...`);
      await User.create({
        email,
        password,
        firstName,
        lastName,
        phone,
        role: superAdminRole._id,
        isActive: true
      });
      console.log('Super admin created successfully.');
    }

    const verifyUser = await User.findOne({ email }).populate('role');
    console.log(`Verified: ${verifyUser.email} — Role: ${verifyUser.role?.name || 'N/A'}`);
    console.log('Password is stored as bcrypt hash (not shown).');
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

createSuperAdmin();
