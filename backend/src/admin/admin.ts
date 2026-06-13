import { Router, Response } from "express";
import { prisma } from "../shared/prisma";
import { AuthenticatedRequest, authMiddleware } from "../shared/authMiddleware";

const router = Router();
router.use(authMiddleware);

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// 1. GET /admin/demo (Exposes all diagnosis logs, resolved state maps, and audits)
router.get("/demo", async (req: AuthenticatedRequest, res: Response) => {
  try {
    // A. Fetch Import Jobs
    const rawJobs = await prisma.importJob.findMany({
      include: { anomalies: true },
      orderBy: { uploadedAt: "desc" }
    });

    const importJobs = rawJobs.map(job => ({
      ...job,
      summary: parseJsonField(job.summary, null),
      anomalies: job.anomalies.map(a => ({
        ...a,
        rawRow: parseJsonField(a.rawRow, {}),
        normalizedRow: parseJsonField(a.normalizedRow, {})
      }))
    }));

    // B. Fetch Audit Logs
    const rawLogs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" }
    });
    const auditLogs = rawLogs.map(l => ({
      ...l,
      beforeState: parseJsonField(l.beforeState, null),
      afterState: parseJsonField(l.afterState, null)
    }));

    // C. Fetch groups and memberships
    const memberships = await prisma.groupMembership.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        group: { select: { id: true, name: true } }
      },
      orderBy: { joinedAt: "desc" }
    });

    return res.json({
      success: true,
      importJobs,
      auditLogs,
      memberships
    });
  } catch (err: any) {
    console.error("Admin demo view error:", err);
    return res.status(500).json({ success: false, message: "Failed to load admin diagnostics data." });
  }
});

export default router;
