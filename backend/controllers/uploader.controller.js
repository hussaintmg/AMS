const crypto = require("crypto");
const mongoose = require("mongoose");
const FileUpload = require("../models/FileUpload.model");
const logger = require("../utils/logger");
const {
  FILE_DEFINITIONS,
  FILE_TYPE_ORDER,
  ImportFileError,
  parseSpreadsheet,
  detectFileType,
} = require("../services/imports/spreadsheetMapper");
const {
  importBatch,
  previewBatch,
} = require("../services/imports/importEngine");
const { ImportDebugAudit, importTrace } = require("../services/imports/importDebugAudit");
const searchIndex = require("../services/searchIndex.service");

const clientBatchId = (value) => {
  const candidate = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    candidate,
  )
    ? candidate
    : crypto.randomUUID();
};

const userIdFor = (req) => req.user?._id || req.user?.id || null;

function selectedFiles(req) {
  return FILE_TYPE_ORDER.flatMap((logicalType) => {
    const definition = FILE_DEFINITIONS[logicalType];
    const files = req.files?.[definition.fieldName] || [];
    // fileKey identifies one uploaded workbook for the whole request, so several
    // files of the same logical type keep separate logs, progress and results.
    return files.map((file, index) => ({
      logicalType,
      definition,
      file,
      fileKey: `${logicalType}#${index}`,
    }));
  });
}

function validationIssue(selection, error) {
  return {
    fileType: selection.logicalType,
    fileKey: selection.fileKey,
    fileName: selection.file?.originalname || "",
    sheetName: error.details?.sheetName || "",
    row: null,
    sourceIdentifier: "",
    errorType: error.code || error.name || "FILE_VALIDATION",
    field: "",
    value: "",
    missingField: error.code === "MISSING_REQUIRED_HEADERS" ? "headers" : "",
    relatedEntity: "",
    message: error.message,
    details: error.details || null,
  };
}

async function createUploadLogs(selections, batchId, userId) {
  const logs = new Map();
  for (const selection of selections) {
    const upload = await FileUpload.create({ // eslint-disable-line no-await-in-loop
      batchId,
      logicalType: selection.logicalType,
      fileName: selection.file.originalname,
      originalName: selection.file.originalname,
      filePath: "",
      mimeType: selection.file.mimetype || "",
      size:
        selection.file.size != null
          ? selection.file.size
          : selection.file.buffer?.length,
      module: selection.definition.module,
      status: "validating",
      progress: 0,
      uploadedBy: userId,
    });
    logs.set(selection.fileKey, upload);
  }
  return logs;
}

async function markValidationFailure(logs, issues) {
  await Promise.all(
    [...logs.entries()].map(([fileKey, upload]) => {
      const matching = issues.filter((issue) => (
        issue.fileKey ? issue.fileKey === fileKey : issue.fileName === upload.fileName
      ));
      return FileUpload.updateOne(
        { _id: upload._id },
        {
          $set: {
            status: matching.length ? "failed" : "not_imported",
            progress: 100,
            summary: { failed: matching.length, errors: matching },
            notes: matching
              .map((issue) => issue.message)
              .join("\n")
              .slice(0, 4000),
          },
        },
      );
    }),
  );
}

async function uploadBatch(req, res, next) {
  const selections = selectedFiles(req);

  if (!selections.length) {
    return res.status(400).json({
      success: false,
      status: "validation_failed",
      message:
        "Select at least one Order Intake, Order Sales, or Dispatch Report file.",
      errors: [
        {
          errorType: "NO_FILES",
          message: "No supported source file was selected.",
        },
      ],
    });
  }

  const batchId = clientBatchId(req.body?.batchId);
  const userId = userIdFor(req);
  const mode = String(req.body?.mode || "")
    .trim()
    .toLowerCase();
  importTrace("[IMPORT_REQUEST]", {
    route: req.originalUrl || req.url,
    method: req.method,
    mode,
    dryRun: mode === "preview",
    preview: mode === "preview",
    commit: mode === "commit",
    fileCount: selections.length,
  });
  importTrace("[IMPORT_API_RECEIVED]", {
    mode,
    contentType: req.headers["content-type"] || null,
  });
  importTrace("[IMPORT_DB_CONNECTION]", {
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    databaseName: mongoose.connection.name,
  });

  if (!["preview", "commit"].includes(mode)) {
    return res.status(400).json({
      success: false,
      batchId,
      status: "validation_failed",
      message: 'Import mode must be explicitly set to "preview" or "commit".',
      errors: [
        {
          errorType: "IMPORT_MODE_REQUIRED",
          field: "mode",
          message:
            "Use mode=preview for planning or mode=commit for database writes.",
        },
      ],
    });
  }
  const audit = new ImportDebugAudit({ batchId, mode, userId });

  // Several workbooks per type are allowed, but the exact same bytes twice in
  // one batch is a selection mistake — importing it twice cannot add anything.
  const seenChecksums = new Map();
  const duplicateFileErrors = [];
  selections.forEach((selection) => {
    const checksum = crypto
      .createHash("sha256")
      .update(selection.file.buffer)
      .digest("hex");
    selection.checksum = checksum;
    const previous = seenChecksums.get(checksum);
    if (previous) {
      duplicateFileErrors.push({
        fileType: selection.logicalType,
        fileKey: selection.fileKey,
        fileName: selection.file.originalname,
        errorType: "DUPLICATE_FILE_IN_BATCH",
        message: `"${selection.file.originalname}" has the same contents as "${previous}"; remove one of them.`,
      });
      return;
    }
    seenChecksums.set(checksum, selection.file.originalname);
  });
  if (duplicateFileErrors.length) {
    duplicateFileErrors.forEach((issue) =>
      audit.event("file.validation.failed", issue, { level: "error" }),
    );
    const auditFile = await audit.finalize("validation_failed", {
      errorType: "DUPLICATE_FILE_IN_BATCH",
    });
    return res.status(400).json({
      success: false,
      status: "validation_failed",
      message: "The same file was selected more than once in this batch.",
      errors: duplicateFileErrors,
      debugAuditFile: auditFile,
    });
  }

  const typeMismatches = [];
  for (const selection of selections) {
    try {
      const detected = audit.run(() => detectFileType(selection.file));
      if (detected && detected.logicalType !== selection.logicalType) {
        typeMismatches.push({
          fileType: selection.logicalType,
          fileKey: selection.fileKey,
          fileName: selection.file.originalname,
          errorType: "FILE_TYPE_MISMATCH",
          message: `File "${selection.file.originalname}" was placed in the ${FILE_DEFINITIONS[selection.logicalType].label} slot but appears to be a ${FILE_DEFINITIONS[detected.logicalType].label}.`,
        });
      }
    } catch (_) {
      // Detection failure is non-fatal; parsing will catch structural issues.
    }
  }
  if (typeMismatches.length) {
    typeMismatches.forEach((issue) =>
      audit.event("file.validation.failed", issue, { level: "error" }),
    );
    const auditFile = await audit.finalize("validation_failed", {
      errorType: "FILE_TYPE_MISMATCH",
    });
    return res.status(422).json({
      success: false,
      status: "validation_failed",
      message: "One or more files do not match their assigned import slot.",
      errors: typeMismatches,
      debugAuditFile: auditFile,
    });
  }

  // The audit starts before detection so validation-only failures also produce an artifact.
  let logs;
  try {
    logs = await createUploadLogs(selections, batchId, userId);
    const parsedFiles = [];
    const validationErrors = [];
    for (const selection of selections) {
      try {
        const parsed = audit.run(() =>
          parseSpreadsheet(selection.file, selection.logicalType),
        );
        parsed.fileKey = selection.fileKey;
        parsedFiles.push(parsed);
        audit.file({
          uploadedFilename: parsed.fileName,
          assignedSourceType: selection.logicalType,
          detectedSourceType: selection.logicalType,
          mimeType: parsed.mimeType,
          size: parsed.size,
          fileHash: parsed.checksum,
          sheetNames: parsed.sheetNames,
          sheets: parsed.mappingReport.map((mapping) => ({
            sheetName: mapping.sheetName,
            headerRow: mapping.headerRow,
            detectedHeaders: mapping.columns.map(
              (column) => column.sourceHeader,
            ),
            mappedHeaders: mapping.columns,
            numberOfRows: parsed.records.filter(
              (record) => record._meta.sheetName === mapping.sheetName,
            ).length,
          })),
          numberOfRows: parsed.records.length,
        });
        await FileUpload.updateOne(
          { _id: logs.get(selection.fileKey)._id },
          {
            $set: {
              checksum: parsed.checksum,
              sheetNames: parsed.sheetNames,
              mappingReport: parsed.mappingReport,
              status: "validated",
              progress: 5,
            },
          },
        );
      } catch (error) {
        if (!(error instanceof ImportFileError)) throw error;
        validationErrors.push(validationIssue(selection, error));
      }
    }

    if (mode === "commit") {
      const previewLogs = await FileUpload.find({
        batchId,
        uploadedBy: userId,
        status: "previewed",
      })
        .select("logicalType checksum fileName")
        .lean();
      if (previewLogs.length) {
        // Match by content, not by slot: several files share a logical type, so
        // only the checksum set proves the commit covers the approved preview.
        const approvedChecksums = new Set(
          previewLogs.map((entry) => entry.checksum).filter(Boolean),
        );
        parsedFiles.forEach((parsed) => {
          if (!approvedChecksums.has(parsed.checksum)) {
            validationErrors.push({
              fileType: parsed.logicalType,
              fileKey: parsed.fileKey,
              fileName: parsed.fileName,
              errorType: "PREVIEW_FILE_CHANGED",
              message: `"${parsed.fileName}" does not match any file in the approved preview. Preview the current selection again before importing.`,
            });
          }
        });
        if (approvedChecksums.size !== parsedFiles.length) {
          validationErrors.push({
            fileType: "",
            errorType: "PREVIEW_FILE_SET_CHANGED",
            message:
              "The selected file set no longer matches the approved preview. Preview the current selection again before importing.",
          });
        }
      }
    }

    if (validationErrors.length) {
      await markValidationFailure(logs, validationErrors);
      validationErrors.forEach((issue) =>
        audit.event("file.validation.failed", issue, { level: "error" }),
      );
      const auditFile = await audit.finalize("validation_failed", {
        validationErrorCount: validationErrors.length,
      });
      return res.status(422).json({
        success: false,
        batchId,
        status: "validation_failed",
        message:
          "The import batch was not started because one or more files failed validation.",
        errors: validationErrors,
        debugAuditFile: auditFile,
      });
    }
    if (mode === "preview") {
      const preview = await previewBatch(parsedFiles, { audit });
      preview.mode = "preview";
      preview.batchId = batchId;
      await Promise.all(
        preview.files.map((file) =>
          FileUpload.updateOne(
            { _id: logs.get(file.fileKey)._id },
            {
              $set: {
                status: "previewed",
                progress: 100,
                summary: {
                  totalRows: file.totalRows,
                  successful: file.successful,
                  plannedCreate: file.plannedCreate,
                  plannedUpdate: file.plannedUpdate,
                  plannedReuse: file.plannedReuse,
                  duplicates: file.duplicates,
                  failed: file.failed,
                  errors: file.errors,
                  warnings: file.warnings,
                },
              },
            },
          ),
        ),
      );
      const auditFile = await audit.finalize("preview_ready", {
        totals: preview.totals,
        entityTotals: preview.entities,
      });
      preview.debugAuditFile = auditFile;
      return res.status(200).json({
        success: true,
        batchId,
        status: "preview_ready",
        message:
          "Validation and dependency preview completed. Confirm to execute valid rows.",
        data: preview,
        debugAuditFile: auditFile,
      });
    }

    const persistedProgress = new Map();
    // Indexing every imported document one save at a time adds thousands of round
    // trips to a batch that already runs for minutes. The index is rebuilt once
    // the batch finishes instead.
    searchIndex.pauseIndexing();
    let result;
    try {
      result = await importBatch(parsedFiles, {
        mode: "commit",
        userId,
        onProgress: async ({ fileKey, status, progress }) => {
          const upload = logs.get(fileKey);
          if (!upload) return;
          const previous = persistedProgress.get(fileKey) || 0;
          if (
            progress < 100 &&
            progress - previous < 10 &&
            status === "importing"
          )
            return;
          persistedProgress.set(fileKey, progress);
          await FileUpload.updateOne(
            { _id: upload._id },
            {
              $set: { status, progress },
            },
          );
        },
        audit,
      });
    } finally {
      searchIndex.resumeIndexing({ actor: req.user || null });
    }
    result.batchId = batchId;
    result.mode = "commit";

    await Promise.all(
      result.files.map((file) =>
        FileUpload.updateOne(
          { _id: logs.get(file.fileKey)._id },
          {
            $set: {
              status: file.status,
              progress: 100,
              summary: {
                totalRows: file.totalRows,
                successful: file.successful,
                created: file.created,
                updated: file.updated,
                skipped: file.skipped,
                duplicates: file.duplicates,
                failed: file.failed,
                errors: file.errors,
                warnings: file.warnings,
              },
              mappingReport: file.mappingReport,
              notes: file.errors
                .map((error) => error.message)
                .join("\n")
                .slice(0, 4000),
            },
          },
        ),
      ),
    );
    const auditFile = await audit.finalize(result.status, {
      totals: result.totals,
      entityTotals: result.entities,
      transactionMode: result.transactionMode,
    });
    result.debugAuditFile = auditFile;

    return res.status(200).json({
      success: result.status === "completed",
      batchId,
      status: result.status,
      message:
        result.status === "completed"
          ? "Import completed successfully."
          : "Import completed with row-level errors. Valid rows were committed; failed rows were rolled back.",
      data: result,
      debugAuditFile: auditFile,
    });
  } catch (error) {
    if (logs) {
      await Promise.all(
        [...logs.values()].map((upload) =>
          FileUpload.updateOne(
            { _id: upload._id },
            { $set: { status: "failed", progress: 100, notes: error.message } },
          ).catch(() => {}),
        ),
      );
    }
    if (typeof audit !== "undefined") {
      audit.event(
        "batch.failed",
        {
          batchId: typeof batchId !== "undefined" ? batchId : "",
          exactReason: error.message,
          errorName: error.name,
          errorCode: error.code || null,
        },
        { level: "error" },
      );
      await audit
        .finalize("failed", { fatalError: error.message })
        .catch(() => {});
    }
    console.error("[IMPORT_FATAL_ERROR]", error);
    logger.error(`XLSX import batch ${batchId} failed`, error);
    return next(error);
  }
}

exports.uploadBatch = uploadBatch;

async function detectFileTypeHandler(req, res, next) {
  let audit = null;
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded." });
    }
    const batchId = crypto.randomUUID();
    audit = new ImportDebugAudit({
      batchId,
      mode: "detection",
      userId: userIdFor(req),
    });
    const result = audit.run(() => detectFileType(req.file));
    if (!result) {
      const debugAuditFile = await audit.finalize("detection_failed");
      return res.status(422).json({
        success: false,
        message:
          "Could not determine file type. Ensure the file is a Dealer Pro XLSX with standard headers.",
        debugAuditFile,
      });
    }
    audit.file({
      uploadedFilename: req.file.originalname || "",
      detectedSourceType: result.logicalType,
      mimeType: req.file.mimetype || "",
      size: req.file.size != null ? req.file.size : req.file.buffer?.length,
      fileHash: result.fileHash,
      sheetNames: result.sheetNames,
      sheets: result.sheets,
      numberOfRows: result.sheets.reduce(
        (sum, sheet) => sum + Number(sheet.numberOfRows || 0),
        0,
      ),
    });
    const debugAuditFile = await audit.finalize("detected");
    const definition = FILE_DEFINITIONS[result.logicalType];
    return res.json({
      success: true,
      data: {
        logicalType: result.logicalType,
        label: definition.label,
        confidence: result.confidence,
        sheets: result.sheets,
        fileHash: result.fileHash,
      },
      debugAuditFile,
    });
  } catch (error) {
    if (audit) {
      audit.event(
        "file.detection.failed",
        {
          uploadedFilename: req.file?.originalname || "",
          exactReason: error.message,
          errorName: error.name,
          errorCode: error.code || null,
        },
        { level: "error" },
      );
      await audit
        .finalize("detection_failed", { fatalError: error.message })
        .catch(() => {});
    }
    if (error instanceof ImportFileError) {
      return res.status(422).json({
        success: false,
        message: error.message,
        debugAuditFile: audit?.filePath || null,
      });
    }
    return next(error);
  }
}

exports.detectFileType = detectFileTypeHandler;
