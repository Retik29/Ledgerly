import { Router, Response } from "express";
import { prisma } from "../shared/prisma";
import { AuthenticatedRequest, authMiddleware } from "../shared/authMiddleware";
import { MembershipEngine } from "../memberships/membershipEngine";
import { Decimal } from "@prisma/client/runtime/library";

const router = Router();

router.use(authMiddleware);

// 1. POST /expenses (Create manual expense)
router.post("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId, title, description, amount, currency, paidBy, expenseDate, splitType, splitWith, splitDetails } = req.body;

    if (!groupId || !title || !amount || !paidBy || !expenseDate || !splitType || !splitWith || splitWith.length === 0) {
      return res.status(400).json({ error: "Missing required expense fields." });
    }

    const expDate = new Date(expenseDate);
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number." });
    }

    // A. Check memberships
    const memberships = await prisma.groupMembership.findMany({
      where: { groupId }
    });

    const userIdsToCheck = [...splitWith];
    if (!userIdsToCheck.includes(paidBy)) {
      userIdsToCheck.push(paidBy);
    }

    // Verify all participants are active members on the expense date
    for (const uId of userIdsToCheck) {
      const userPeriods = memberships.filter(m => m.userId === uId).map(m => ({
        joinedAt: m.joinedAt,
        leftAt: m.leftAt
      }));

      const isActive = MembershipEngine.isMemberActiveOnDate(userPeriods, expDate);
      if (!isActive) {
        return res.status(400).json({
          error: `Membership violation: User is not an active member on date ${expenseDate.split("T")[0]}.`
        });
      }
    }

    // B. Calculate split shares in INR
    const currencyUpper = currency ? currency.toUpperCase().trim() : "INR";
    const exchangeRate = currencyUpper === "USD" ? 83.0 : 1.0;
    const normalizedAmount = parseFloat((parsedAmount * exchangeRate).toFixed(2));

    // Map user IDs to names for splitting (needed for details lookup)
    const users = await prisma.user.findMany({
      where: { id: { in: splitWith } }
    });
    const userMap: { [name: string]: string } = {};
    users.forEach(u => {
      userMap[u.name.toLowerCase().trim()] = u.id;
    });

    // Helper to calculate exact share amount per participant
    const shares: { userId: string; sharePercentage: number | null; shareAmount: number; shareWeight: number | null }[] = [];
    const n = splitWith.length;

    if (splitType === "equal") {
      const rawShare = normalizedAmount / n;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const share = parseFloat(rawShare.toFixed(2));
        const isLast = i === n - 1;
        const finalShare = isLast ? parseFloat((normalizedAmount - sum).toFixed(2)) : share;
        sum += finalShare;

        shares.push({
          userId: splitWith[i],
          sharePercentage: parseFloat((100 / n).toFixed(2)),
          shareAmount: finalShare,
          shareWeight: null
        });
      }
    } else if (splitType === "percentage") {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const uId = splitWith[i];
        const user = users.find(u => u.id === uId);
        const nameKey = user?.name.toLowerCase().trim() || "";
        const pct = splitDetails?.[nameKey] || splitDetails?.[uId] || 0;
        const share = parseFloat((normalizedAmount * (pct / 100)).toFixed(2));
        
        const isLast = i === n - 1;
        const finalShare = isLast ? parseFloat((normalizedAmount - sum).toFixed(2)) : share;
        sum += finalShare;

        shares.push({
          userId: uId,
          sharePercentage: pct,
          shareAmount: finalShare,
          shareWeight: null
        });
      }
    } else if (splitType === "exact" || splitType === "unequal") {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const uId = splitWith[i];
        const user = users.find(u => u.id === uId);
        const nameKey = user?.name.toLowerCase().trim() || "";
        const origAmt = splitDetails?.[nameKey] || splitDetails?.[uId] || 0;
        const share = parseFloat((origAmt * exchangeRate).toFixed(2));
        
        const isLast = i === n - 1;
        const finalShare = isLast ? parseFloat((normalizedAmount - sum).toFixed(2)) : share;
        sum += finalShare;

        shares.push({
          userId: uId,
          sharePercentage: null,
          shareAmount: finalShare,
          shareWeight: null
        });
      }
    } else if (splitType === "share" || splitType === "weight") {
      let totalWeight = 0;
      const weights: number[] = [];
      for (let i = 0; i < n; i++) {
        const uId = splitWith[i];
        const user = users.find(u => u.id === uId);
        const nameKey = user?.name.toLowerCase().trim() || "";
        const w = splitDetails?.[nameKey] !== undefined ? splitDetails[nameKey] : (splitDetails?.[uId] !== undefined ? splitDetails[uId] : 1);
        weights.push(w);
        totalWeight += w;
      }

      let sum = 0;
      for (let i = 0; i < n; i++) {
        const uId = splitWith[i];
        const w = weights[i];
        const share = totalWeight > 0 ? parseFloat((normalizedAmount * (w / totalWeight)).toFixed(2)) : 0;
        
        const isLast = i === n - 1;
        const finalShare = isLast ? parseFloat((normalizedAmount - sum).toFixed(2)) : share;
        sum += finalShare;

        shares.push({
          userId: uId,
          sharePercentage: totalWeight > 0 ? parseFloat(((w / totalWeight) * 100).toFixed(2)) : 0,
          shareAmount: finalShare,
          shareWeight: w
        });
      }
    }

    // C. Write to DB inside transaction
    const expense = await prisma.$transaction(async (tx) => {
      const newExpense = await tx.expense.create({
        data: {
          groupId,
          title: title.trim(),
          description: description?.trim() || null,
          amount: new Decimal(parsedAmount),
          currency: currencyUpper,
          exchangeRate: new Decimal(exchangeRate),
          normalizedAmount: new Decimal(normalizedAmount),
          paidBy,
          expenseDate: expDate,
          splitType
        }
      });

      for (const s of shares) {
        await tx.expenseParticipant.create({
          data: {
            expenseId: newExpense.id,
            userId: s.userId,
            sharePercentage: s.sharePercentage !== null ? new Decimal(s.sharePercentage) : null,
            shareAmount: new Decimal(s.shareAmount),
            shareWeight: s.shareWeight !== null ? new Decimal(s.shareWeight) : null
          }
        });
      }

      return newExpense;
    });

    return res.status(201).json(expense);
  } catch (err: any) {
    console.error("Create expense error:", err);
    return res.status(500).json({ error: "Failed to create expense." });
  }
});

// 2. GET /groups/:groupId/expenses (Retrieve non-deleted expenses)
router.get("/group/:groupId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId } = req.params;

    const expenses = await prisma.expense.findMany({
      where: {
        groupId,
        deletedAt: null // Exclude soft deleted expenses
      },
      include: {
        payer: { select: { id: true, name: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { expenseDate: "desc" }
    });

    return res.json(expenses);
  } catch (err: any) {
    console.error("Get expenses error:", err);
    return res.status(500).json({ error: "Failed to fetch expenses." });
  }
});

// 3. DELETE /expenses/:id (Soft delete expense)
router.delete("/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const expense = await prisma.expense.findUnique({
      where: { id }
    });

    if (!expense) return res.status(404).json({ error: "Expense not found." });

    // Update deletedAt
    const updated = await prisma.expense.update({
      data: { deletedAt: new Date() },
      where: { id }
    });

    // Write to audit log
    await prisma.auditLog.create({
      data: {
        entityType: "EXPENSE",
        entityId: id,
        action: "SOFT_DELETE",
        performedBy: req.user?.id,
        beforeState: JSON.stringify({ title: expense.title, deletedAt: null }),
        afterState: JSON.stringify({ title: expense.title, deletedAt: updated.deletedAt })
      }
    });

    return res.json({ message: "Expense successfully deleted.", expense: updated });
  } catch (err: any) {
    console.error("Delete expense error:", err);
    return res.status(500).json({ error: "Failed to delete expense." });
  }
});

export default router;
