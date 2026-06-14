import { Router, Response } from "express";
import { prisma } from "../shared/prisma";
import { AuthenticatedRequest, authMiddleware } from "../shared/authMiddleware";
import { BalanceEngine } from "../balances/balanceEngine";

const router = Router();

// Apply auth middleware to all group routes
router.use(authMiddleware);

// 1. POST /groups
router.post("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name } = req.body;
    const creatorId = req.user?.id;

    if (!name || !creatorId) {
      return res.status(400).json({ error: "Group name is required." });
    }

    const group = await prisma.$transaction(async (tx) => {
      // Create group
      const newGroup = await tx.group.create({
        data: {
          name: name.trim(),
          createdBy: creatorId
        }
      });

      // Add creator as member
      await tx.groupMembership.create({
        data: {
          groupId: newGroup.id,
          userId: creatorId,
          joinedAt: new Date()
        }
      });

      // Write to audit log
      await tx.auditLog.create({
        data: {
          entityType: "GROUP",
          entityId: newGroup.id,
          action: "CREATE",
          performedBy: creatorId,
          afterState: JSON.stringify(newGroup)
        }
      });

      return newGroup;
    });

    return res.status(201).json(group);
  } catch (err: any) {
    console.error("Create group error:", err);
    return res.status(500).json({ error: "Failed to create group." });
  }
});

// 2. GET /groups
router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Retrieve groups where the user is currently or historically a member
    const memberships = await prisma.groupMembership.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            memberships: {
              include: {
                user: {
                  select: { id: true, name: true, email: true }
                }
              }
            }
          }
        }
      }
    });

    // Compute totalSpent and user's net position for each group
    const groupsWithBalances = await Promise.all(
      memberships.map(async (m) => {
        const g = m.group;

        // Fetch active expenses to calculate total spent
        const expenses = await prisma.expense.findMany({
          where: { groupId: g.id, deletedAt: null },
          include: { participants: true }
        });

        // Fetch active settlements
        const settlements = await prisma.settlement.findMany({
          where: { groupId: g.id, deletedAt: null }
        });

        const groupUsers = g.memberships.map((gm) => ({
          id: gm.userId,
          name: gm.user.name
        }));

        const summaries = BalanceEngine.computeBalances(groupUsers, expenses, settlements);
        const userSummary = summaries.find((s) => s.userId === userId);
        const userNetBalance = userSummary ? userSummary.netBalance : 0;
        const totalSpent = expenses.reduce((sum, e) => sum + e.normalizedAmount, 0);

        return {
          ...g,
          totalSpent,
          userNetBalance
        };
      })
    );

    return res.json(groupsWithBalances);
  } catch (err: any) {
    console.error("Get groups error:", err);
    return res.status(500).json({ error: "Failed to fetch groups." });
  }
});

// 3. GET /groups/:id
router.get("/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Verify membership
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId: id, userId }
    });

    if (!membership) {
      return res.status(403).json({ error: "Access denied. Not a member of this group." });
    }

    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found." });
    }

    return res.json(group);
  } catch (err: any) {
    console.error("Get group detail error:", err);
    return res.status(500).json({ error: "Failed to fetch group details." });
  }
});

// 4. PATCH /groups/:id
router.patch("/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user?.id;

    if (!name) return res.status(400).json({ error: "Group name is required." });
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Only creator can edit group details
    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) return res.status(404).json({ error: "Group not found." });

    if (group.createdBy !== userId) {
      return res.status(403).json({ error: "Forbidden. Only group creator can edit." });
    }

    const updated = await prisma.group.update({
      data: { name: name.trim() },
      where: { id }
    });

    return res.json(updated);
  } catch (err: any) {
    console.error("Update group error:", err);
    return res.status(500).json({ error: "Failed to update group." });
  }
});

export default router;
