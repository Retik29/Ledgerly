import { Router, Response } from "express";
import crypto from "crypto";
import { prisma } from "../shared/prisma";
import { AuthenticatedRequest, authMiddleware } from "../shared/authMiddleware";
import { CsvParser } from "./csvParser";
import { Normalizer } from "./normalizer";
import { AnomalyEngine } from "../anomalies/anomalyEngine";
import { ImportContext } from "../anomalies/rules";
import { PersistenceService } from "./persistence";
import { ResolvedAnomaly } from "./decisionEngine";

const router = Router();
router.use(authMiddleware);

type ImportStage =
  | "REQUEST_VALIDATION"
  | "DUPLICATE_CHECK"
  | "CSV_PARSER"
  | "NORMALIZER"
  | "IMPORT_CONTEXT"
  | "ANOMALY_ENGINE"
  | "IMPORT_JOB_SAVE"
  | "RESOLVE_VALIDATION"
  | "PERSISTENCE";

class ImportError extends Error {
  stage: ImportStage;
  statusCode: number;

  constructor(stage: ImportStage, message: string, statusCode = 400) {
    super(message);
    this.name = "ImportError";
    this.stage = stage;
    this.statusCode = statusCode;
  }
}

function logImportStage(stageName: string, input: unknown, output: unknown) {
  console.log(`[IMPORT:${stageName}]`, {
    input,
    output
  });
}

function jsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, currentValue) => {
    if (currentValue instanceof Date) {
      return currentValue.toISOString();
    }
    return currentValue;
  });
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toClientAnomaly(anomaly: any) {
  return {
    ...anomaly,
    rawRow: parseJsonField(anomaly.rawRow, anomaly.rawRow),
    normalizedRow: parseJsonField(anomaly.normalizedRow, anomaly.normalizedRow)
  };
}

function toClientJob(job: any) {
  return {
    ...job,
    summary: parseJsonField(job.summary, null),
    anomalies: job.anomalies?.map(toClientAnomaly)
  };
}

function handleImportError(res: Response, err: any, fallbackStage: ImportStage, fallbackMessage: string) {
  console.error(`Import error at ${err?.stage || fallbackStage}:`, err);
  if (err instanceof ImportError) {
    return res.status(err.statusCode).json({
      success: false,
      stage: err.stage,
      message: err.message
    });
  }

  return res.status(400).json({
    success: false,
    stage: fallbackStage,
    message: err?.message || fallbackMessage
  });
}

// Helper to calculate file hash
function getHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

// 1. POST /imports/upload
router.post("/upload", async (req: AuthenticatedRequest, res: Response) => {
  let stage: ImportStage = "REQUEST_VALIDATION";
  try {
    const { filename, csvContent, groupId } = req.body;
    const userId = req.user?.id;

    if (!filename || !csvContent || !groupId || !userId) {
      throw new ImportError(stage, "Missing filename, csvContent, or groupId.");
    }

    // Verify user belongs to the group they are importing into
    const userMembership = await prisma.groupMembership.findFirst({
      where: {
        groupId,
        userId
      }
    });
    if (!userMembership) {
      throw new ImportError(stage, "Unauthorized: you are not a member of this group.", 403);
    }

    console.log("[IMPORT] groupId =", groupId);
    logImportStage(stage, { filename, groupId, bytes: csvContent.length }, { userId });

    // A. Regression protection: check if hash already imported
    stage = "DUPLICATE_CHECK";
    const hash = getHash(csvContent);
    const existingJob = await prisma.importJob.findFirst({
      where: {
        rawFileHash: hash,
        status: "COMPLETED"
      }
    });

    if (existingJob) {
      throw new ImportError(
        stage,
        `Duplicate import detected. This exact CSV file has already been imported successfully. Job: ${existingJob.id}`,
        409
      );
    }
    logImportStage(stage, { hash }, { duplicate: false });

    // B. Parse & normalize CSV
    stage = "CSV_PARSER";
    const rawRows = CsvParser.parse(csvContent);
    if (rawRows.length === 0) {
      throw new ImportError(stage, "CSV did not contain any data rows.");
    }
    logImportStage(stage, { filename }, { rowsParsed: rawRows.length, sample: rawRows[0] });

    stage = "NORMALIZER";
    const normalizedRows = rawRows.map(r => Normalizer.normalize(r));
    logImportStage(stage, { rowsParsed: rawRows.length }, { rowsNormalized: normalizedRows.length, sample: normalizedRows[0] });

    const diagnostics = {
      rowsParsed: rawRows.length,
      rowsNormalized: normalizedRows.length,
      anomaliesFound: 0,
      errorsFound: 0,
      currentStage: "ANALYZED"
    };

    // C. Gather Anomaly Detection Context
    stage = "IMPORT_CONTEXT";
    const dbUsers = await prisma.user.findMany();
    const existingUsers = dbUsers.map(u => Normalizer.normalizeName(u.name));

    // Gather memberships
    const memberships = await prisma.groupMembership.findMany({
      where: { groupId }
    });
    const membershipMap: { [userName: string]: { joinedAt: Date; leftAt: Date | null }[] } = {};
    
    // Group membership periods by user name
    memberships.forEach(m => {
      const user = dbUsers.find(u => u.id === m.userId);
      if (user) {
        const name = Normalizer.normalizeName(user.name);
        const list = membershipMap[name] || [];
        list.push({ joinedAt: m.joinedAt, leftAt: m.leftAt });
        membershipMap[name] = list;
      }
    });

    // Gather existing expenses for duplicate checks
    const dbExpenses = await prisma.expense.findMany({
      where: { groupId, deletedAt: null },
      include: { payer: true }
    });
    const existingExpenses = dbExpenses.map(e => ({
      id: e.id,
      date: e.expenseDate,
      amount: Number(e.amount),
      paidBy: Normalizer.normalizeName(e.payer.name),
      description: e.title
    }));
    const userMap: { [name: string]: string } = {};
    dbUsers.forEach(u => {
      userMap[Normalizer.normalizeName(u.name)] = u.id;
    });

    const availableMembers = memberships.map(m => {
      const u = dbUsers.find(user => user.id === m.userId);
      return u ? u.name : "";
    }).filter(Boolean);
    console.log(`[UNKNOWN_USER] groupId=${groupId} availableMembers=[${availableMembers.join(", ")}]`);

    logImportStage(stage, { groupId }, {
      users: existingUsers.length,
      memberships: memberships.length,
      existingExpenses: existingExpenses.length
    });

    const context: ImportContext = {
      groupId,
      userMap,
      existingUsers,
      memberships: membershipMap,
      otherParsedRows: normalizedRows,
      existingExpenses
    };

    // D. Run Anomaly Engine
    stage = "ANOMALY_ENGINE";
    const engine = new AnomalyEngine();
    const anomalies = engine.detectAll(rawRows, normalizedRows, context);
    diagnostics.anomaliesFound = anomalies.length;
    diagnostics.errorsFound = anomalies.filter(a => ["ERROR", "BLOCKING"].includes(a.severity)).length;
    logImportStage(stage, { rowsNormalized: normalizedRows.length }, {
      anomaliesFound: anomalies.length,
      bySeverity: anomalies.reduce((acc, a) => {
        acc[a.severity] = (acc[a.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    });

    // E. Save ImportJob and anomalies to DB inside a transaction
    stage = "IMPORT_JOB_SAVE";
    const job = await prisma.$transaction(async (tx) => {
      const newJob = await tx.importJob.create({
        data: {
          groupId,
          rawFileName: filename,
          rawFileHash: hash,
          status: anomalies.length > 0 ? "REVIEW_REQUIRED" : "APPROVED",
          summary: jsonStringify({
            rowsProcessed: rawRows.length,
            expensesCreated: 0,
            settlementsCreated: 0,
            anomaliesFound: anomalies.length,
            errorsFound: diagnostics.errorsFound,
            currentStage: "REVIEW_QUEUE"
          })
        }
      });

      // Save anomalies
      for (const a of anomalies) {
        await tx.importAnomaly.create({
          data: {
            importJobId: newJob.id,
            rowNumber: a.rowNumber,
            fingerprint: a.fingerprint,
            severity: a.severity,
            anomalyType: a.anomalyType,
            description: a.description,
            rawRow: jsonStringify(a.rawRow),
            normalizedRow: jsonStringify(a.normalizedRow),
            policyType: a.policyType,
            policyVersion: a.policyVersion
          }
        });
      }

      return newJob;
    });
    logImportStage(stage, { anomalies: anomalies.length }, { jobId: job.id, status: job.status });

    const fullJob = await prisma.importJob.findUnique({
      where: { id: job.id },
      include: {
        anomalies: {
          orderBy: { rowNumber: "asc" }
        },
        group: {
          include: {
            memberships: {
              include: {
                user: true
              }
            }
          }
        }
      }
    });

    const unknownUserAnomalies = anomalies.filter(a => a.anomalyType === "UNKNOWN_USER");
    if (unknownUserAnomalies.length > 0) {
      console.log("[UNKNOWN_USER] importJobId =", job.id);
      console.log("[UNKNOWN_USER] importJob.groupId =", groupId);
      console.log("[UNKNOWN_USER] resolved group =", groupId);
      console.log("[UNKNOWN_USER] returned members =", availableMembers);
    }

    return res.status(201).json({
      success: true,
      jobId: job.id,
      status: job.status,
      anomaliesCount: anomalies.length,
      diagnostics,
      anomalies: anomalies.map(toClientAnomaly),
      job: toClientJob(fullJob)
    });

  } catch (err: any) {
    return handleImportError(res, err, stage, "Failed to upload and analyze CSV.");
  }
});

/* 
  Previous implementation intentionally replaced by staged import pipeline above.
*/

// 2. GET /imports/jobs
router.get("/jobs", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Fetch user groups
    const memberships = await prisma.groupMembership.findMany({
      where: { userId }
    });
    const userGroupIds = memberships.map(m => m.groupId);

    // Build filter
    const where: any = {
      groupId: { in: userGroupIds }
    };

    // If groupId query param is provided, filter by it after checking user belongs to it
    const { groupId } = req.query;
    if (typeof groupId === "string" && groupId) {
      if (!userGroupIds.includes(groupId)) {
        return res.status(403).json({ error: "Unauthorized: you are not a member of this group." });
      }
      where.groupId = groupId;
    }

    const jobs = await prisma.importJob.findMany({
      where,
      orderBy: { uploadedAt: "desc" }
    });
    return res.json(jobs.map(toClientJob));
  } catch (err: any) {
    console.error("Get import jobs error:", err);
    return res.status(500).json({ error: "Failed to fetch import history." });
  }
});

// 3. GET /imports/jobs/:id
router.get("/jobs/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const job = await prisma.importJob.findUnique({
      where: { id },
      include: {
        anomalies: {
          orderBy: { rowNumber: "asc" }
        },
        group: {
          include: {
            memberships: {
              include: {
                user: true
              }
            }
          }
        }
      }
    });

    if (!job) return res.status(404).json({ error: "Import job not found." });

    if (!job.groupId) {
      return res.status(400).json({ error: "Import job is missing group context." });
    }

    // Verify user belongs to the job's group
    const membership = await prisma.groupMembership.findFirst({
      where: {
        groupId: job.groupId,
        userId
      }
    });
    if (!membership) {
      return res.status(403).json({ error: "Unauthorized: you are not a member of the group this import belongs to." });
    }

    return res.json(toClientJob(job));
  } catch (err: any) {
    console.error("Get import job details error:", err);
    return res.status(500).json({ error: "Failed to fetch import job details." });
  }
});

// 4. POST /imports/jobs/:id/resolve
router.post("/jobs/:id/resolve", async (req: AuthenticatedRequest, res: Response) => {
  let stage: ImportStage = "RESOLVE_VALIDATION";
  try {
    const { id } = req.params;
    const { groupId, resolutions } = req.body; // resolutions is list of ResolvedAnomaly
    console.log("[IMPORT] groupId =", groupId);
    const userId = req.user?.id;

    if (!groupId || !resolutions || !userId) {
      throw new ImportError(stage, "Missing groupId, resolutions, or userId.");
    }

    // Verify user belongs to the group
    const userMembership = await prisma.groupMembership.findFirst({
      where: {
        groupId,
        userId
      }
    });
    if (!userMembership) {
      throw new ImportError(stage, "Unauthorized: you are not a member of this group.", 403);
    }

    const job = await prisma.importJob.findUnique({
      where: { id },
      include: { anomalies: true }
    });

    if (!job) throw new ImportError(stage, "Import job not found.", 404);

    console.log("IMPORT JOB GROUP", job.groupId);
    console.log("RESOLUTION GROUP", groupId);
    const availMemberships = await prisma.groupMembership.findMany({
      where: { groupId: job.groupId || "" },
      include: { user: true }
    });
    console.log("AVAILABLE MEMBERS", availMemberships.map(m => m.user.name));

    if (job.groupId !== groupId) {
      throw new ImportError(stage, `Import job group mismatch. Job belongs to group ${job.groupId}, but request specified group ${groupId}.`, 400);
    }

    // Validate that no unresolved BLOCKING anomalies exist
    const blockingAnomalies = job.anomalies.filter(a => a.severity === "BLOCKING");
    for (const block of blockingAnomalies) {
      const isResolved = resolutions.some((r: any) => {
        const fingerprintMatches = r.anomalyType === block.fingerprint;
        const actionIsValid = r.resolutionAction !== null && r.resolutionAction !== undefined;
        return fingerprintMatches && actionIsValid;
      });
      if (!isResolved) {
        throw new ImportError(
          stage,
          `Cannot proceed with import: blocking anomaly on row ${block.rowNumber} (${block.anomalyType}) is unresolved.`
        );
      }
    }


    const { csvContent } = req.body;
    if (!csvContent) {
      throw new ImportError(stage, "csvContent is required to persist resolved import.");
    }
    logImportStage(stage, { jobId: id, resolutions: resolutions.length }, { blockingAnomalies: blockingAnomalies.length });

    // Update anomaly statuses in DB before committing persistence
    await prisma.$transaction(async (tx) => {
      for (const resolution of resolutions) {
        const anomaly = job.anomalies.find(a => a.fingerprint === resolution.anomalyType);
        if (anomaly) {
          await tx.importAnomaly.update({
            data: {
              status: "RESOLVED",
              resolutionAction: resolution.resolutionAction,
              resolutionNote: resolution.resolutionNote,
              resolvedAt: new Date(),
              resolvedBy: userId
            },
            where: { id: anomaly.id }
          });
        }
      }

      await tx.importJob.update({
        data: { status: "APPROVED" },
        where: { id }
      });
    });

    // Run persistence engine
    stage = "PERSISTENCE";
    const summary = await PersistenceService.finalizeImport(
      id,
      groupId,
      userId,
      csvContent,
      resolutions
    );
    logImportStage(stage, { jobId: id }, summary);

    return res.json({
      success: true,
      message: "CSV imported and resolved successfully.",
      summary
    });

  } catch (err: any) {
    return handleImportError(res, err, stage, "Failed to finalize import.");
  }
});

export default router;
