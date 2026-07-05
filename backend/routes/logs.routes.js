const express = require("express");
const router = express.Router();
const logController = require("../controllers/logController");
const { authenticate, authorize } = require("../middleware/auth");

/**
 * @swagger
 * tags:
 *   name: Logs
 *   description: Unified API Log management
 */

/**
 * @swagger
 * /api/logs:
 *   get:
 *     tags: [Logs]
 *     summary: Query logs with filters + pagination + permission scoping
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: logsOf
 *         schema: { type: string, example: server }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: requestId
 *         schema: { type: string }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: timeFrom
 *         schema: { type: string, example: "09:00" }
 *       - in: query
 *         name: timeTo
 *         schema: { type: string, example: "18:00" }
 *       - in: query
 *         name: method
 *         schema: { type: string, enum: [GET,POST,PUT,PATCH,DELETE] }
 *       - in: query
 *         name: severity
 *         schema: { type: string, enum: [info,warning,error,critical] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [success, failed] }
 *       - in: query
 *         name: success
 *         schema: { type: string, enum: [success, failed, "true", "false"] }
 *       - in: query
 *         name: statusCode
 *         schema: { type: integer }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: roleName
 *         schema: { type: string }
 *       - in: query
 *         name: role
 *         schema: { type: string }
 *       - in: query
 *         name: hasError
 *         schema: { type: string, enum: ["true"] }
 *       - in: query
 *         name: serverError
 *         schema: { type: string, enum: [yes, no] }
 *       - in: query
 *         name: endpoint
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc,desc], default: desc }
 *       - in: query
 *         name: filterVersion
 *         schema: { type: string, description: "Current filter version from client; backend returns filterVersionChanged to signal refresh" }
 *     responses:
 *       200:
 *         description: Paginated logs with permission-scoped filter metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logs fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     logs:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page: { type: integer, example: 1 }
 *                         limit: { type: integer, example: 25 }
 *                         total: { type: integer, example: 100 }
 *                         totalPages: { type: integer, example: 4 }
 *                         hasNextPage: { type: boolean, example: true }
 *                         hasPrevPage: { type: boolean, example: false }
 *                     filters:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         users:
 *                           type: array
 *                           items: { type: object }
 *                         roles:
 *                           type: array
 *                           items: { type: object }
 *                         methods:
 *                           type: array
 *                           items: { type: string }
 *                         statusCodes:
 *                           type: array
 *                           items: { type: integer }
 *                         severities:
 *                           type: array
 *                           items: { type: string }
 *                         endpoints:
 *                           type: array
 *                           items: { type: string }
 *                         requestIds:
 *                           type: array
 *                           items: { type: string }
 *                         includeServerErrors:
 *                           type: boolean
 *                     filterVersion:
 *                       type: string
 *                       description: "Current filter version hash for client-side caching"
 *                     filterVersionChanged:
 *                       type: boolean
 *                       description: "True if client's filterVersion differs from server; client should refresh filter options"
 */
/**
 * @swagger
 * /api/logs/filter-options:
 *   get:
 *     tags: [Logs]
 *     summary: Get all filter dropdown options scoped by user permission
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Filter options object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     options:
 *                       type: object
 *                       properties:
 *                         users:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id: { type: string }
 *                               name: { type: string }
 *                               email: { type: string }
 *                               roleName: { type: string }
 *                         roles:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id: { type: string }
 *                               name: { type: string }
 *                               displayName: { type: string }
 *                         methods:
 *                           type: array
 *                           items: { type: string }
 *                         severities:
 *                           type: array
 *                           items: { type: string }
 *                         statusCodes:
 *                           type: array
 *                           items: { type: integer }
 *                         endpoints:
 *                           type: array
 *                           items: { type: string }
 *                         requestIds:
 *                           type: array
 *                           items: { type: string }
 *                         includeServerErrors:
 *                           type: boolean
 *                     version:
 *                       type: string
 *                       description: Hash of filter options for client caching
 */
router.get("/", authenticate, logController.queryLogs);
router.get("/filter-options", authenticate, logController.getFilterOptions);
router.get("/stats", authenticate, logController.getLogStats);
router.get("/:id", authenticate, logController.getLogById);
router.delete(
  "/:id",
  authenticate,
  authorize("super_admin"),
  logController.deleteLog,
);

// Legacy redirects — keep old paths working
router.get("/api-logs", authenticate, logController.queryLogs);
router.get("/api-logs/stats", authenticate, logController.getLogStats);
router.get("/api-logs/:id", authenticate, logController.getLogById);
router.delete(
  "/api-logs/:id",
  authenticate,
  authorize("super_admin"),
  logController.deleteLog,
);
router.get("/audit-logs", authenticate, logController.queryLogs);
router.get("/audit-logs/stats", authenticate, logController.getLogStats);
router.get("/audit-logs/:id", authenticate, logController.getLogById);
router.delete(
  "/audit-logs/:id",
  authenticate,
  authorize("super_admin"),
  logController.deleteLog,
);

module.exports = router;
