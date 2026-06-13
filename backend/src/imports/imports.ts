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

// Helper to calculate file hash
function getHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

// 1. POST /imports/upload
router.post("/upload", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filename, csvContent, groupId } = req.body;
    const userId = req.user?.id;

    if (!filename || !csvContent || !groupId || !userId) {
      return res.status(400).json({ error: "Missing filename, csvContent, or groupId." });
    }

    // A. Regression protection: check if hash already imported
    const hash = getHash(csvContent);
    const existingJob = await prisma.importJob.findFirst({
      where: {
        rawFileHash: hash,
        status: "COMPLETED"
      }
    });

    if (existingJob) {
      return res.status(400).json({
        error: "Duplicate import detected. This exact CSV file has already been imported successfully.",
        jobId: existingJob.id
      });
    }

    // B. Parse & normalize CSV
    const rawRows = CsvParser.parse(csvContent);
    const normalizedRows = rawRows.map(r => Normalizer.normalize(r));

    // C. Gather Anomaly Detection Context
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
      amount: e.amount.toNumber(),
      paidBy: Normalizer.normalizeName(e.payer.name),
      description: e.title
    }));

    const context: ImportContext = {
      existingUsers,
      memberships: membershipMap,
      otherParsedRows: normalizedRows,
      existingExpenses
    };

    // D. Run Anomaly Engine
    const engine = new AnomalyEngine();
    const anomalies = engine.detectAll(rawRows, normalizedRows, context);

    // E. Save ImportJob and anomalies to DB inside a transaction
    const job = await prisma.$transaction(async (tx) => {
      const newJob = await tx.importJob.create({
        data: {
          rawFileName: filename,
          rawFileHash: hash,
          status: anomalies.length > 0 ? "REVIEW_REQUIRED" : "APPROVED"
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
            rawRow: a.rawRow as any,
            normalizedRow: a.normalizedRow as any,
            policyType: a.policyType,
            policyVersion: a.policyVersion
          }
        });
      }

      return newJob;
    });

    return res.status(201).json({
      jobId: job.id,
      status: job.status,
      anomaliesCount: anomalies.length,
      anomalies
    });

  } catch (err: any) {
    console.error("Upload import error:", err);
    return res.status(500).json({ error: "Failed to upload and analyze CSV." });
  }
});

// 2. GET /imports/jobs
router.get("/jobs", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const jobs = await prisma.importJob.findMany({
      orderBy: { uploadedAt: "desc" }
    });
    return res.json(jobs);
  } catch (err: any) {
    console.error("Get import jobs error:", err);
    return res.status(500).json({ error: "Failed to fetch import history." });
  }
});

// 3. GET /imports/jobs/:id
router.get("/jobs/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const job = await prisma.importJob.findUnique({
      where: { id },
      include: {
        anomalies: {
          orderBy: { rowNumber: "asc" }
        }
      }
    });

    if (!job) return res.status(404).json({ error: "Import job not found." });

    return res.json(job);
  } catch (err: any) {
    console.error("Get import job details error:", err);
    return res.status(500).json({ error: "Failed to fetch import job details." });
  }
});

// 4. POST /imports/jobs/:id/resolve
router.post("/jobs/:id/resolve", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { groupId, resolutions } = req.body; // resolutions is list of ResolvedAnomaly
    const userId = req.user?.id;

    if (!groupId || !resolutions || !userId) {
      return res.status(400).json({ error: "Missing groupId, resolutions, or userId." });
    }

    const job = await prisma.importJob.findUnique({
      where: { id },
      include: { anomalies: true }
    });

    if (!job) return res.status(404).json({ error: "Import job not found." });

    // Validate that no unresolved BLOCKING anomalies exist
    const blockingAnomalies = job.anomalies.filter(a => a.severity === "BLOCKING");
    for (const block of blockingAnomalies) {
      const isResolved = resolutions.some((r: any) => r.anomalyType === block.anomalyType && r.resolutionAction !== null);
      if (!isResolved) {
        return res.status(400).json({
          error: `Cannot proceed with import: blocking anomaly on row ${block.rowNumber} (${block.anomalyType}) is unresolved.`
        });
      }
    }

    // Since we don't store the raw CSV text directly in the Job record to save database space,
    // the client posts the CSV content back or we reconstruct it.
    // Better: let's verify if the client passes the csvContent back as part of the body
    const { csvContent } = req.body;
    if (!csvContent) {
      return res.status(400).json({ error: "csvContent is required to persist resolved import." });
    }

    // Update anomaly statuses in DB before committing persistence
    await prisma.$transaction(async (tx) => {
      for (const res of resolutions) {
        // Find corresponding anomaly by matching type/fingerprint
        const anomaly = job.anomalies.find(a => a.fingerprint === res.anomalyType);
        if (anomaly) {
          await tx.importAnomaly.update({
            data: {
              status: "RESOLVED",
              resolutionAction: res.resolutionAction,
              resolutionNote: res.resolutionNote,
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
    const summary = await PersistenceService.finalizeImport(
      id,
      groupId,
      userId,
      csvContent,
      resolutions
    );

    return res.json({
      message: "CSV imported and resolved successfully.",
      summary
    });

  } catch (err: any) {
    console.error("Resolve import error:", err);
    return res.status(500).json({ error: err.message || "Failed to finalize import." });
  }
});

export default router;
