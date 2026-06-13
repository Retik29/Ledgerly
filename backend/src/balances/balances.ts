import { Router, Response } from "express";
import { prisma } from "../shared/prisma";
import { AuthenticatedRequest, authMiddleware } from "../shared/authMiddleware";
import { BalanceEngine } from "./balanceEngine";

const router = Router();

router.use(authMiddleware);

// 1. GET /balances/group/:groupId
router.get("/group/:groupId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId } = req.params;

    // Verify group exists
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) return res.status(404).json({ error: "Group not found." });

    // A. Retrieve all memberships (historical and current) to get user details
    const memberships = await prisma.groupMembership.findMany({
      where: { groupId },
      include: {
        user: { select: { id: true, name: true } }
      }
    });

    // Extract unique users
    const userMap = new Map<string, { id: string; name: string }>();
    memberships.forEach(m => {
      userMap.set(m.userId, { id: m.userId, name: m.user.name });
    });
    const users = Array.from(userMap.values());

    // B. Retrieve all active expenses
    const expenses = await prisma.expense.findMany({
      where: {
        groupId,
        deletedAt: null
      },
      include: {
        participants: true
      }
    });

    // C. Retrieve all active settlements
    const settlements = await prisma.settlement.findMany({
      where: {
        groupId,
        deletedAt: null
      }
    });

    // D. Compute balances and traces
    const summaries = BalanceEngine.computeBalances(users, expenses, settlements);

    // E. Simplify debts
    const simplifiedDebts = BalanceEngine.simplifyDebts(summaries);

    return res.json({
      summaries,
      simplifiedDebts
    });
  } catch (err: any) {
    console.error("Get balances error:", err);
    return res.status(500).json({ error: "Failed to fetch balances." });
  }
});

export default router;
