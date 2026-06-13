import { Router, Response } from "express";
import { prisma } from "../shared/prisma";
import { AuthenticatedRequest, authMiddleware } from "../shared/authMiddleware";

const router = Router();

router.use(authMiddleware);

// 1. POST /groups/:id/members (Add a member to a group)
router.post("/groups/:id/members", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { email, joinedAt } = req.body;

    if (!email) {
      return res.status(400).json({ error: "User email is required." });
    }

    // Check if group exists
    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) return res.status(404).json({ error: "Group not found." });

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (!user) {
      return res.status(404).json({ error: `User with email '${email}' not found. They must register first.` });
    }

    // Check if they are already a member
    const existing = await prisma.groupMembership.findFirst({
      where: {
        groupId: id,
        userId: user.id,
        leftAt: null // Only active membership
      }
    });

    if (existing) {
      return res.status(400).json({ error: "User is already an active member of this group." });
    }

    const membership = await prisma.groupMembership.create({
      data: {
        groupId: id,
        userId: user.id,
        joinedAt: joinedAt ? new Date(joinedAt) : new Date()
      },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    return res.status(201).json(membership);
  } catch (err: any) {
    console.error("Add member error:", err);
    return res.status(500).json({ error: "Failed to add member to group." });
  }
});

// 2. PATCH /membership/:id (Update leftAt or joinedAt)
router.patch("/membership/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { leftAt, joinedAt } = req.body;

    const membership = await prisma.groupMembership.findUnique({
      where: { id },
      include: { group: true }
    });

    if (!membership) return res.status(404).json({ error: "Membership record not found." });

    // Validate that only group members/creators can update
    const isAuthorized = membership.userId === req.user?.id || membership.group.createdBy === req.user?.id;
    if (!isAuthorized) {
      return res.status(403).json({ error: "Unauthorized to modify membership." });
    }

    const updated = await prisma.groupMembership.update({
      data: {
        joinedAt: joinedAt ? new Date(joinedAt) : undefined,
        leftAt: leftAt ? new Date(leftAt) : null // allows clearing leftAt
      },
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    return res.json(updated);
  } catch (err: any) {
    console.error("Update membership error:", err);
    return res.status(500).json({ error: "Failed to update membership." });
  }
});

// 3. DELETE /membership/:id (Soft-leave group - set leftAt)
router.delete("/membership/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { leftAt } = req.body; // option to supply specific leave date

    const membership = await prisma.groupMembership.findUnique({
      where: { id },
      include: { group: true }
    });

    if (!membership) return res.status(404).json({ error: "Membership record not found." });

    // Soft delete: update leftAt date
    const updated = await prisma.groupMembership.update({
      data: {
        leftAt: leftAt ? new Date(leftAt) : new Date()
      },
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    return res.json({
      message: "Member successfully soft-removed from group.",
      membership: updated
    });
  } catch (err: any) {
    console.error("Soft delete membership error:", err);
    return res.status(500).json({ error: "Failed to remove member." });
  }
});

export default router;
