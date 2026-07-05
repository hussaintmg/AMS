const crypto = require('crypto');
const Log = require("../models/mongo/Log.model");
const Role = require("../models/Role.model");
const logger = require("../utils/logger");
const { buildAllowedLogsQuery } = require("../utils/logPermissionResolver");
const permissionCache = require("../utils/permissionCache");

const serverErrorExpr = [
  { serverError: true },
  { "user.id": { $in: [null, ""] } },
  { userName: "Server Errors" },
  { logFilePath: /[\\/]Server-Errors[\\/]/i },
  { physicalLogPath: /[\\/]Server-Errors[\\/]/i },
];

const mergeAnd = (query, condition) => {
  if (!condition) return query;
  query.$and = [...(query.$and || []), condition];
  return query;
};

const buildDateRange = (filters = {}) => {
  const dateFrom =
    filters.dateFrom || filters.startDate || filters.dateTimeFrom;
  const dateTo = filters.dateTo || filters.endDate || filters.dateTimeTo;
  const timeFrom = filters.timeFrom;
  const timeTo = filters.timeTo;
  const range = {};
  const effectiveDateFrom = dateFrom || dateTo;
  const effectiveDateTo = dateTo || dateFrom;

  if (effectiveDateFrom) {
    const start = new Date(effectiveDateFrom);
    if (timeFrom) {
      const [h, m] = timeFrom.split(":");
      start.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
    } else {
      start.setHours(0, 0, 0, 0);
    }
    range.$gte = start;
  }

  if (effectiveDateTo) {
    const end = new Date(effectiveDateTo);
    if (timeTo) {
      const [h, m] = timeTo.split(":");
      end.setHours(Number(h) || 0, Number(m) || 0, 59, 999);
    } else {
      end.setHours(23, 59, 59, 999);
    }
    range.$lte = end;
  }

  if (!dateFrom && timeFrom) {
    const start = new Date();
    const [h, m] = timeFrom.split(":");
    start.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
    range.$gte = start;
  }

  if (!dateTo && timeTo) {
    const end = new Date();
    const [h, m] = timeTo.split(":");
    end.setHours(Number(h) || 0, Number(m) || 0, 59, 999);
    range.$lte = end;
  }

  return Object.keys(range).length ? range : null;
};

const addSearchFilter = (query, search) => {
  if (!search) return;
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "i");
  const normalized = String(search || "")
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ");
  if (normalized === "server errors" || normalized === "server error") {
    mergeAnd(query, { $or: serverErrorExpr });
    return;
  }
  mergeAnd(query, {
    $or: [
      { requestId: re },
      { endpoint: re },
      { apiName: re },
      { method: re },
      { severity: re },
      { message: re },
      { errorMessage: re },
      { "user.firstName": re },
      { "user.lastName": re },
      { "user.email": re },
      { "user.role": re },
      { userName: re },
      { userEmail: re },
      { roleName: re },
      { logFilePath: re },
      { physicalLogPath: re },
      {
        $expr: {
          $regexMatch: {
            input: { $toString: "$statusCode" },
            regex: escaped,
            options: "i",
          },
        },
      },
    ],
  });
};

const buildFiltersQuery = (filters = {}) => {
  const query = {};

  addSearchFilter(query, filters.search);

  const dateRange = buildDateRange(filters);
  if (dateRange) query.createdAt = dateRange;

  if (filters.method) query.method = filters.method.toUpperCase();

  if (filters.severity) query.severity = filters.severity.toLowerCase();

  if (filters.statusCode !== undefined && filters.statusCode !== "") {
    query.statusCode = Number(filters.statusCode);
  }

  if (
    filters.status === "success" ||
    filters.success === "success" ||
    filters.success === "true" ||
    filters.hasError === "false"
  ) {
    mergeAnd(query, { statusCode: { $lt: 400 } });
  }
  if (
    filters.status === "failed" ||
    filters.success === "failed" ||
    filters.success === "false" ||
    filters.hasError === "true"
  ) {
    mergeAnd(query, { statusCode: { $gte: 400 } });
  }

  if (filters.userId) query["user.id"] = filters.userId;

  if (filters.roleId) query["user.roleId"] = filters.roleId;

  if (filters.roleName || filters.role) {
    query["user.role"] = filters.roleName || filters.role;
  }

  if (filters.endpoint) {
    const escaped = filters.endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    mergeAnd(query, {
      $or: [
        { endpoint: { $regex: escaped, $options: "i" } },
        { apiName: { $regex: escaped, $options: "i" } },
      ],
    });
  }

  if (filters.requestId) {
    const escaped = filters.requestId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.requestId = { $regex: escaped, $options: "i" };
  }

  if (
    filters.serverError === "yes" ||
    filters.serverError === "true" ||
    filters.logsOf === "server-errors"
  ) {
    mergeAnd(query, { $or: serverErrorExpr });
  }
  if (filters.serverError === "no" || filters.serverError === "false") {
    mergeAnd(query, { $nor: serverErrorExpr });
  }

  if (
    filters.logsOf &&
    filters.logsOf !== "server-errors" &&
    filters.logsOf !== "all"
  ) {
    query["user.id"] = filters.logsOf;
  }

  return query;
};

const combinePermissionAndFilters = async (user, filters = {}) => {
  const permissionQuery = await buildAllowedLogsQuery(
    user.effectiveLogPermission,
    user.id || user._id,
  );
  const filtersQuery = buildFiltersQuery(filters);

  const combined = { isDeleted: { $ne: true } };

  if (Object.keys(permissionQuery).length) {
    mergeAnd(combined, permissionQuery);
  }
  if (Object.keys(filtersQuery).length) {
    mergeAnd(combined, filtersQuery);
  }

  return combined;
};

const queryLogs = async (filters = {}, user) => {
  const query = await combinePermissionAndFilters(user, filters);
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 25));
  const sortOrder = filters.sortOrder || "desc";
  const sortField = filters.sortBy || "createdAt";

  const requestFilterVersion = filters.filterVersion || '';

  const shouldIncludeFilters = page === 1 || filters.includeFilters === 'true' || !filters.filterVersion;
  const [data, total, filterResult] = await Promise.all([
    Log.find(query)
      .sort({ [sortField]: sortOrder === "desc" ? -1 : 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Log.countDocuments(query),
    shouldIncludeFilters ? getFilterOptions(user) : Promise.resolve({ options: null, version: '' }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const filterVersion = filterResult.version || '';
  const filterVersionChanged = requestFilterVersion && filterVersion && requestFilterVersion !== filterVersion;

  return {
    logs: data,
    filters: filterResult.options,
    filterVersion,
    filterVersionChanged,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};

const getLogById = async (id, user) => {
  const query = await combinePermissionAndFilters(user, {});
  query._id = id;
  query.isDeleted = { $ne: true };
  return Log.findOne(query).lean();
};

const deleteLog = async (id) => {
  const log = await Log.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!log) return null;

  const fs = require("fs");
  const physicalPath = log.physicalLogPath || log.logFilePath;
  if (physicalPath) {
    try {
      fs.unlinkSync(physicalPath);
    } catch (error) {
      if (error.code !== "ENOENT")
        logger.warn("Failed to delete physical log file:", error.message);
    }
  }

  log.isDeleted = true;
  await log.save();
  return log;
};

const getLogStats = async (filters = {}, user) => {
  const match = await combinePermissionAndFilters(user, filters);

  const stats = await Log.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        success: { $sum: { $cond: [{ $lt: ["$statusCode", 400] }, 1, 0] } },
        errors: { $sum: { $cond: [{ $gte: ["$statusCode", 400] }, 1, 0] } },
        serverErrors: {
          $sum: {
            $cond: [
              { $or: ["$serverError", { $gte: ["$statusCode", 500] }] },
              1,
              0,
            ],
          },
        },
        avgExecutionTime: { $avg: "$executionTime" },
        maxExecutionTime: { $max: "$executionTime" },
      },
    },
  ]);

  const [methodDist, severityDist] = await Promise.all([
    Log.aggregate([
      { $match: match },
      { $group: { _id: "$method", count: { $sum: 1 } } },
    ]),
    Log.aggregate([
      { $match: match },
      { $group: { _id: "$severity", count: { $sum: 1 } } },
    ]),
  ]);

  return {
    ...(stats[0] || {
      total: 0,
      success: 0,
      errors: 0,
      serverErrors: 0,
      avgExecutionTime: 0,
      maxExecutionTime: 0,
    }),
    methodDistribution: methodDist.reduce(
      (acc, item) => ({ ...acc, [item._id]: item.count }),
      {},
    ),
    severityDistribution: severityDist.reduce(
      (acc, item) => ({ ...acc, [item._id]: item.count }),
      {},
    ),
  };
};

const buildFilterVersion = (options) => {
  const hash = crypto.createHash('md5');
  hash.update(JSON.stringify(options));
  return hash.digest('hex').slice(0, 8);
};

const emptyFilterOptions = () => ({
  users: [],
  roles: [],
  methods: [],
  severities: [],
  statusCodes: [],
  endpoints: [],
  requestIds: [],
  includeServerErrors: false,
});

const aggregateFilterOptions = async (scoped) => {
  const pipeline = [
    { $match: scoped },
    {
      $group: {
        _id: null,
        methods: { $addToSet: "$method" },
        severities: { $addToSet: "$severity" },
        statusCodes: { $addToSet: "$statusCode" },
        endpoints: { $addToSet: "$endpoint" },
        requestIds: { $addToSet: "$requestId" },
        users: {
          $addToSet: {
            id: "$user.id",
            email: "$user.email",
            firstName: "$user.firstName",
            lastName: "$user.lastName",
            roleName: "$user.role",
          },
        },
        serverErrorCount: {
          $sum: { $cond: [{ $or: [{ $eq: ["$serverError", true] }, { $gte: ["$statusCode", 500] }] }, 1, 0] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        methods: 1,
        severities: 1,
        statusCodes: 1,
        endpoints: 1,
        requestIds: 1,
        users: 1,
        serverErrorCount: 1,
      },
    },
  ];

  const results = await Log.aggregate(pipeline).allowDiskUse(true);
  if (!results.length) {
    const opts = emptyFilterOptions();
    return { options: opts, version: buildFilterVersion(opts) };
  }

  const data = results[0];
  const usersArr = (data.users || []).filter((u) => u.id).map((u) => ({
    id: u.id,
    email: u.email || '',
    roleName: u.roleName || '',
    name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id,
  })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const roleNames = [...new Set(usersArr.map((u) => u.roleName).filter(Boolean))];
  const roleDocs = await Role.find({ name: { $in: roleNames } })
    .select('name displayName')
    .lean();
  const roleMap = new Map(roleDocs.map((r) => [r.name, r]));
  const roles = roleNames.map((name) => ({
    id: roleMap.get(name)?._id?.toString() || name,
    name,
    displayName: roleMap.get(name)?.displayName || name,
  }));

  const options = {
    users: usersArr,
    roles,
    methods: (data.methods || []).filter(Boolean).sort(),
    severities: (data.severities || []).filter(Boolean).sort(),
    statusCodes: (data.statusCodes || []).filter((c) => c !== null && c !== undefined).sort((a, b) => a - b),
    endpoints: (data.endpoints || []).filter(Boolean).sort(),
    requestIds: (data.requestIds || []).filter(Boolean).sort(),
    includeServerErrors: (data.serverErrorCount || 0) > 0,
  };

  return {
    options,
    version: buildFilterVersion(options),
  };
};

const getFilterOptions = async (user) => {
  const base = { isDeleted: { $ne: true } };
  const permissionQuery = await buildAllowedLogsQuery(
    user.effectiveLogPermission,
    user.id || user._id,
  );
  const scoped = { ...base };
  if (Object.keys(permissionQuery).length) {
    mergeAnd(scoped, permissionQuery);
  }

  const result = await aggregateFilterOptions(scoped);
  if (!result) {
    return { options: null, version: '' };
  }
  return result;
};

module.exports = {
  queryLogs,
  getLogById,
  deleteLog,
  getLogStats,
  getFilterOptions,
};
