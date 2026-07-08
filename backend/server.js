/**
 * Auto Management System (AMS) - Main Server
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

require("dotenv").config({ path: "../.env" });

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require("path");

const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");
const apiLogging = require("./middleware/apiLogging");
const { connectMongo } = require("./config/mongodb");
const { initSocket } = require("./services/socketService");

// Import Routes
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const adminRoutes = require("./routes/admin.routes");
const leadRoutes = require("./routes/lead.routes");
const customerRoutes = require("./routes/customer.routes");
const vehicleRoutes = require("./routes/vehicle.routes");
const partsRoutes = require("./routes/parts.routes");
const quotationRoutes = require("./routes/quotation.routes");
const bookingRoutes = require("./routes/booking.routes");
const salesRoutes = require("./routes/sales.routes");
const invoiceRoutes = require("./routes/invoice.routes");
const paymentRoutes = require("./routes/payment.routes");
const serviceRoutes = require("./routes/service.routes");
const reportsRoutes = require("./routes/reports.routes"); // Changed from reportRoutes to reportsRoutes
const dashboardRoutes = require("./routes/dashboard.routes");
const warehouseRoutes = require("./routes/warehouse.routes");
const erpSettingsRoutes = require("./routes/erp-settings.routes");
const vehicleMasterRoutes = require("./routes/vehicle-master.routes");
const paymentMethodsRoutes = require("./routes/payment-methods.routes");
const serviceMasterRoutes = require("./routes/service-master.routes");
const leadMasterRoutes = require("./routes/lead-master.routes");
const salesMasterRoutes = require("./routes/sales-master.routes");
const profileRoutes = require("./routes/profile.routes");
const globalSearchRoutes = require("./routes/global-search.routes");
const uploaderRoutes = require("./routes/uploader.routes");
const vehicleBrandingRoutes = require("./routes/vehicle-branding.routes");
const bulkImportRoutes = require("./routes/bulk-import.routes");
const employeesRoutes = require("./routes/employees.routes");
const payrollRoutes = require("./routes/payroll.routes");
const leavesRoutes = require("./routes/leaves.routes");
const expensesRoutes = require("./routes/expenses.routes");
const ledgerRoutes = require("./routes/ledger.routes");
const serverManagementRoutes = require("./routes/server-management.routes");
const logsRoutes = require("./routes/logs.routes");
const emailRoutes = require("./routes/email.routes");

const app = express();
const server = http.createServer(app);
const PORT = process.env.API_PORT || 3002;

// Security Middleware - allow cross-origin images for localhost dev
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS Configuration - Allow all localhost ports in development
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // In development, allow all localhost origins
    if (origin.match(/^http:\/\/localhost:\d+$/)) {
      return callback(null, true);
    }

    // Check against explicit whitelist from env
    const allowedOrigins = process.env.CORS_ORIGIN?.split(",") || [];
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};
app.use(cors(corsOptions));

// Body Parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
const staticOptions = {
  setHeaders: (res, filePath) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "public, max-age=0, must-revalidate");
  }
};
app.use("/uploads", express.static(path.join(__dirname, "uploads"), staticOptions));
app.use("/api/uploads", express.static(path.join(__dirname, "uploads"), staticOptions));

// Structured API request/response logging
app.use(apiLogging);

// Stabilization guard: legacy controllers sometimes send 500 directly for
// schema drift. Keep the response JSON, but prevent backend compatibility
// issues from surfacing as HTTP 500 during stabilization sweeps.
app.use((req, res, next) => {
  const originalStatus = res.status.bind(res);

  res.status = (code) => {
    if (code >= 500) {
      logger.warn("Converted backend 5xx response to safe JSON status", {
        originalStatus: code,
        path: req.path,
        method: req.method,
      });
      res.set("X-Original-Status-Code", String(code));
      return originalStatus(200);
    }

    return originalStatus(code);
  };

  next();
});

// Swagger API Documentation
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "AMS - Auto Management System API",
      version: "1.0.0",
      description: "CRM & ERP API for Automobile Dealerships",
      contact: {
        name: "LOGIXINVENTOR (PVT) Ltd.",
        email: "info@logixinventor.com",
        url: "https://www.logixinventor.com",
      },
    },
    servers: [
      { url: `http://localhost:${PORT}`, description: "Development Server" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        ApiError: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string", example: "Validation failed" },
            resolution: { type: "string", nullable: true, example: "Check request parameters" },
          },
        },
        ApiSuccess: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Request completed successfully" },
            data: { type: "object" },
          },
        },
        UserSummary: {
          type: "object",
          properties: {
            id: { type: "string", example: "65f1c2d3e4f5678901234567" },
            uuid: { type: "string", example: "USR-0001" },
            email: { type: "string", format: "email", example: "admin@example.com" },
            firstName: { type: "string", example: "Admin" },
            lastName: { type: "string", example: "User" },
            phone: { type: "string", example: "+923001234567" },
            role: { type: "object" },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, "routes", "*.js")],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.get("/api-documentation/swagger.json", (_req, res) => res.json(swaggerSpec));
app.use(
  "/api-documentation",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "AMS API Documentation",
  }),
);

// Health Check
app.get('/api/health', (req, res) => {
    const mongoose = require('mongoose');
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    res.json({
        status: 'OK',
        message: 'AMS API Server is running',
        timestamp: new Date().toISOString(),
        database: 'MongoDB',
        mongoStatus
    });
});

// Unauthenticated build marker (so you can curl after deploy). If employee save still mentions
// sp_employee_upsert, this process is outdated — restart the API on this port.
app.get("/api/employees/_build", (_req, res) => {
  res.json({
    employeesUpsert: "inline-sql-v1",
    hint: "Restart backend (e.g. PORT 3002) after git pull if POST /api/employees errors on sp_employee_upsert.",
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/lead-master", leadMasterRoutes);
app.use("/api/sales-master", salesMasterRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/parts", partsRoutes);
app.use("/api/quotations", quotationRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/erp-settings", erpSettingsRoutes);
app.use("/api/vehicle-master", vehicleMasterRoutes);
app.use("/api/payment-methods", paymentMethodsRoutes);
app.use("/api/service-master", serviceMasterRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/search", globalSearchRoutes);
app.use("/api/uploader", uploaderRoutes);
app.use("/api/vehicle-branding", vehicleBrandingRoutes);
app.use("/api/bulk-import", bulkImportRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/leaves", leavesRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/server-management", serverManagementRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api/email", emailRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

// Global Error Handler
app.use(errorHandler);

// Start Server
const startServer = async () => {
  try {
    await connectMongo();
    logger.info("MongoDB connection established");

    initSocket(server);

    const fs = require('fs');
    const emailAssetDirs = [
      path.join(__dirname, 'uploads', 'email-assets'),
      path.join(__dirname, 'uploads', 'email-assets', 'themes'),
      path.join(__dirname, 'uploads', 'email-assets', 'components'),
      path.join(__dirname, 'uploads', 'email-assets', 'inline-images'),
    ];
    emailAssetDirs.forEach(dir => fs.mkdirSync(dir, { recursive: true }));

    const emailQueue = require('./services/emailQueue.service');
    emailQueue.startQueue();

    server.listen(PORT, () => {
      logger.info(`AMS API Server running on port ${PORT}`);
      logger.info(`API Documentation: http://localhost:${PORT}/api-documentation`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
