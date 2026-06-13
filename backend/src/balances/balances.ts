import { Router, Response } from "express";
import { prisma } from "../shared/prisma";
import { AuthenticatedRequest, authMiddleware } from "../shared/authMiddleware";
import { BalanceEngine } from "./balanceEngine";

const router = Router();

router.use(authMiddleware);

// 1. GET /balances/global
router.get("/global", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Retrieve all memberships where user is member to compute cross-group debts
    const memberships = await prisma.groupMembership.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            memberships: {
              include: {
                user: { select: { id: true, name: true } }
              }
            }
          }
        }
      }
    });

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true }
    });
    if (!currentUser) return res.status(404).json({ error: "User not found." });
    const currentUserName = currentUser.name;

    const globalCreditors: { userName: string; amount: number; groupName: string; groupId: string }[] = [];
    const globalDebtors: { userName: string; amount: number; groupName: string; groupId: string }[] = [];

    for (const m of memberships) {
      const g = m.group;

      const userMap = new Map<string, { id: string; name: string }>();
      g.memberships.forEach(gm => {
        userMap.set(gm.userId, { id: gm.userId, name: gm.user.name });
      });
      const groupUsers = Array.from(userMap.values());

      const expenses = await prisma.expense.findMany({
        where: { groupId: g.id, deletedAt: null },
        include: { participants: true }
      });

      const settlements = await prisma.settlement.findMany({
        where: { groupId: g.id, deletedAt: null }
      });

      const summaries = BalanceEngine.computeBalances(groupUsers, expenses, settlements);
      const simplifiedDebts = BalanceEngine.simplifyDebts(summaries);

      simplifiedDebts.forEach(d => {
        if (d.fromUser === currentUserName) {
          globalDebtors.push({
            userName: d.toUser,
            amount: d.amount,
            groupName: g.name,
            groupId: g.id
          });
        } else if (d.toUser === currentUserName) {
          globalCreditors.push({
            userName: d.fromUser,
            amount: d.amount,
            groupName: g.name,
            groupId: g.id
          });
        }
      });
    }

    return res.json({
      creditors: globalCreditors,
      debtors: globalDebtors
    });
  } catch (err: any) {
    console.error("Get global balances error:", err);
    return res.status(500).json({ error: "Failed to fetch global balances." });
  }
});

// 2. GET /balances/group/:groupId
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
