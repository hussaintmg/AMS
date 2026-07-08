const path = require('path');
const fs = require('fs');
const { EmailAsset } = require('../models');
const AppError = require('../utils/AppError');

const getUserId = (req) => req.user?.id || req.user?._id;
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'email-assets');
const CATEGORY_FOLDERS = {
  general: '',
  theme: 'themes',
  component: 'components',
  'inline-image': 'inline-images',
};

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, category } = req.query;
    const filter = { isDeleted: false };
    if (category) filter.category = category;

    const assets = await EmailAsset.find(filter)
      .populate('uploadedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await EmailAsset.countDocuments(filter);

    res.json({ success: true, data: { assets, total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const asset = await EmailAsset.findOne({ _id: req.params.id, isDeleted: false });
    if (!asset) throw new AppError('Asset not found', 404);
    res.json({ success: true, data: { asset } });
  } catch (error) {
    next(error);
  }
};

exports.upload = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) throw new AppError('At least one file is required', 400);

    const { category = 'general' } = req.body;
    const subFolder = CATEGORY_FOLDERS[category] || '';
    const targetDir = subFolder ? path.join(UPLOAD_ROOT, subFolder) : UPLOAD_ROOT;
    fs.mkdirSync(targetDir, { recursive: true });

    const assets = await Promise.all(req.files.map(async (file) => {
      const ext = path.extname(file.originalname);
      const storedName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const destPath = path.join(targetDir, storedName);
      fs.renameSync(file.path, destPath);

      const asset = await EmailAsset.create({
        fileName: storedName,
        originalName: file.originalname,
        filePath: destPath,
        publicUrl: `/api/uploads/email-assets/${subFolder ? subFolder + '/' : ''}${storedName}`,
        mimeType: file.mimetype,
        size: file.size,
        category,
        uploadedBy: getUserId(req),
      });

      return asset;
    }));

    res.status(201).json({ success: true, message: `${assets.length} asset(s) uploaded`, data: { assets } });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const asset = await EmailAsset.findOne({ _id: req.params.id, isDeleted: false });
    if (!asset) throw new AppError('Asset not found', 404);

    const { altText, category } = req.body;
    if (altText !== undefined) asset.altText = altText;
    if (category !== undefined) asset.category = category;
    await asset.save();

    res.json({ success: true, message: 'Asset updated', data: { asset } });
  } catch (error) {
    next(error);
  }
};

exports.replace = async (req, res, next) => {
  try {
    const asset = await EmailAsset.findOne({ _id: req.params.id, isDeleted: false });
    if (!asset) throw new AppError('Asset not found', 404);
    if (!req.file) throw new AppError('Replacement file is required', 400);

    if (asset.filePath && fs.existsSync(asset.filePath)) {
      fs.unlinkSync(asset.filePath);
    }

    const ext = path.extname(req.file.originalname);
    const storedName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const targetDir = path.dirname(asset.filePath);
    fs.mkdirSync(targetDir, { recursive: true });
    const destPath = path.join(targetDir, storedName);
    fs.renameSync(req.file.path, destPath);

    asset.fileName = storedName;
    asset.originalName = req.file.originalname;
    asset.filePath = destPath;
    asset.mimeType = req.file.mimetype;
    asset.size = req.file.size;
    await asset.save();

    res.json({ success: true, message: 'Asset replaced', data: { asset } });
  } catch (error) {
    next(error);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const asset = await EmailAsset.findOne({ _id: req.params.id, isDeleted: false });
    if (!asset) throw new AppError('Asset not found', 404);

    asset.isDeleted = true;
    await asset.save();

    res.json({ success: true, message: 'Asset deleted' });
  } catch (error) {
    next(error);
  }
};
