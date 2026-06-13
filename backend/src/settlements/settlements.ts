import { Router, Response } from "express";
import { prisma } from "../shared/prisma";
import { AuthenticatedRequest, authMiddleware } from "../shared/authMiddleware";
import { Decimal } from "@prisma/client/runtime/library";

const router = Router();

router.use(authMiddleware);

// 1. POST /settlements (Create settlement)
router.post("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId, payerId, receiverId, amount, currency, settlementDate } = req.body;

    if (!groupId || !payerId || !receiverId || !amount || !settlementDate) {
      return res.status(400).json({ error: "Missing required settlement fields." });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number." });
    }

    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        payerId,
        receiverId,
        amount: parsedAmount,
        currency: currency ? currency.toUpperCase().trim() : "INR",
        settlementDate: new Date(settlementDate)
      }
    });

    return res.status(201).json(settlement);
  } catch (err: any) {
    console.error("Create settlement error:", err);
    return res.status(500).json({ error: "Failed to create settlement." });
  }
});

// 2. GET /groups/:groupId/settlements
router.get("/group/:groupId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId } = req.params;

    const settlements = await prisma.settlement.findMany({
      where: {
        groupId,
        deletedAt: null // Exclude soft deleted settlements
      },
      include: {
        payer: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } }
      },
      orderBy: { settlementDate: "desc" }
    });

    return res.json(settlements);
  } catch (err: any) {
    console.error("Get settlements error:", err);
    return res.status(500).json({ error: "Failed to fetch settlements." });
  }
});

// 3. DELETE /settlements/:id (Soft delete settlement)
router.delete("/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const settlement = await prisma.settlement.findUnique({
      where: { id }
    });

    if (!settlement) return res.status(404).json({ error: "Settlement not found." });

    const updated = await prisma.settlement.update({
      data: { deletedAt: new Date() },
      where: { id }
    });

    // Write to audit log
    await prisma.auditLog.create({
      data: {
        entityType: "SETTLEMENT",
        entityId: id,
        action: "SOFT_DELETE",
        performedBy: req.user?.id,
        beforeState: JSON.stringify({ amount: settlement.amount, deletedAt: null }),
        afterState: JSON.stringify({ amount: settlement.amount, deletedAt: updated.deletedAt })
      }
    });

    return res.json({ message: "Settlement successfully deleted.", settlement: updated });
  } catch (err: any) {
    console.error("Delete settlement error:", err);
    return res.status(500).json({ error: "Failed to delete settlement." });
  }
});

export default router;
