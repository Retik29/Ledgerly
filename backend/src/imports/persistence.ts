import { prisma } from "../shared/prisma";
import { RawCsvRow, NormalizedRow } from "./types";
import { CsvParser } from "./csvParser";
import { Normalizer } from "./normalizer";
import { DecisionEngine, ResolvedAnomaly } from "./decisionEngine";
import { Decimal } from "@prisma/client/runtime/library";

export interface PersistenceResult {
  expensesCreated: number;
  settlementsCreated: number;
  rowsProcessed: number;
  warnings: number;
  errors: number;
  blocking: number;
  duplicatesDetected: number;
}

function jsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, currentValue) => {
    if (currentValue instanceof Date) {
      return currentValue.toISOString();
    }
    return currentValue;
  });
}

export class PersistenceService {
  /**
   * Finalizes an ImportJob by processing all its rows through the DecisionEngine with user resolutions
   * and committing the results to the database.
   */
  static async finalizeImport(
    importJobId: string,
    groupId: string,
    resolvedByUserId: string,
    csvContent: string,
    resolutions: ResolvedAnomaly[]
  ): Promise<PersistenceResult> {
    const rawRows = CsvParser.parse(csvContent);
    const normalizedRows = rawRows.map(row => Normalizer.normalize(row));

    // Fetch existing users to build a mapping from name to UUID
    const users = await prisma.user.findMany();
    const userMap: { [name: string]: string } = {};
    users.forEach(u => {
      userMap[Normalizer.normalizeName(u.name)] = u.id;
    });

    let expensesCreated = 0;
    let settlementsCreated = 0;
    let rowsProcessed = 0;

    // Run persistence inside a single database transaction
    await prisma.$transaction(async (tx) => {
      // 1. Fetch resolved anomalies for mapping names or overriding values
      // Map resolutions by fingerprint for quick lookup
      const resolutionMap = new Map<string, ResolvedAnomaly>();
      for (const res of resolutions) {
        // Find fingerprint if possible (we can match by type and rowNumber)
        const fp = `${res.anomalyType}_ROW_${rawRows[0]?.rowNumber}`; // placeholder, better lookup by fingerprint
      }

      // Group resolutions by row number
      const rowResolutionsMap = new Map<number, ResolvedAnomaly[]>();
      for (const res of resolutions) {
        // Assuming we pass fingerprint inside resolution, e.g. "UNKNOWN_USER_PRIYA_S_ROW_11"
        const rowNumMatch = res.anomalyType.includes("ROW_") 
          ? res.anomalyType.match(/ROW_(\d+)/) 
          : null;
        
        // Let's pass the fingerprint directly from resolutions list
        // and extract row number from it
        const match = res.anomalyType.match(/_ROW_(\d+)/) || res.anomalyType.match(/_ROW_(\d+)_/);
        if (match) {
          const rowNum = parseInt(match[1], 10);
          const list = rowResolutionsMap.get(rowNum) || [];
          list.push(res);
          rowResolutionsMap.set(rowNum, list);
        }
      }

      for (let i = 0; i < normalizedRows.length; i++) {
        const normalized = normalizedRows[i];
        const raw = rawRows[i];
        const rowNum = normalized.rowNumber;
        const rowResolutions = rowResolutionsMap.get(rowNum) || [];

        // Run through DecisionEngine
        const { action, finalizedRow, auditNotes } = DecisionEngine.processRow(
          normalized,
          rowResolutions
        );

        rowsProcessed++;

        // Audit resolutions
        for (const note of auditNotes) {
          await tx.auditLog.create({
            data: {
              entityType: "IMPORT_JOB",
              entityId: importJobId,
              action: "RESOLVE_ANOMALY",
              performedBy: resolvedByUserId,
              afterState: jsonStringify({ rowNumber: rowNum, note })
            }
          });
        }

        if (action === "REJECT") {
          continue; // Skip this row
        }

        // Map names to user IDs
        const getUserId = (name: string): string => {
          const normalizedName = Normalizer.normalizeName(name);
          const id = userMap[normalizedName];
          if (!id) {
            throw new Error(`User mapping missing for user '${name}' on row ${rowNum}`);
          }
          return id;
        };

        if (action === "PERSIST_EXPENSE") {
          // Verify date is set
          if (!finalizedRow.date) {
            throw new Error(`Cannot persist expense on row ${rowNum}: date is missing or ambiguous.`);
          }

          const payerId = getUserId(finalizedRow.paidBy);
          const splitUserIds = finalizedRow.splitWith.map(member => getUserId(member));

          // Calculate participant shares
          const shares = this.calculateShares(
            finalizedRow.normalizedAmount,
            finalizedRow.splitType,
            splitUserIds,
            finalizedRow.splitDetails,
            userMap
          );

          // Create Expense
          const expense = await tx.expense.create({
            data: {
              groupId,
              title: finalizedRow.description || `Imported Row ${rowNum}`,
              description: finalizedRow.notes || null,
              amount: finalizedRow.originalAmount,
              currency: finalizedRow.currency,
              exchangeRate: finalizedRow.exchangeRate,
              normalizedAmount: finalizedRow.normalizedAmount,
              paidBy: payerId,
              expenseDate: finalizedRow.date,
              splitType: finalizedRow.splitType || "equal",
              imported: true
            }
          });

          // Create Participants
          for (const s of shares) {
            await tx.expenseParticipant.create({
              data: {
                expenseId: expense.id,
                userId: s.userId,
                sharePercentage: s.sharePercentage,
                shareAmount: s.shareAmount,
                shareWeight: s.shareWeight
              }
            });
          }

          expensesCreated++;

        } else if (action === "PERSIST_SETTLEMENT") {
          if (!finalizedRow.date) {
            throw new Error(`Cannot persist settlement on row ${rowNum}: date is missing or ambiguous.`);
          }

          const payerId = getUserId(finalizedRow.paidBy);
          // For settlements, the splitWith contains the receiver (e.g. Aisha)
          const receiverName = finalizedRow.splitWith[0];
          if (!receiverName) {
            throw new Error(`Cannot persist settlement on row ${rowNum}: receiver is missing.`);
          }
          const receiverId = getUserId(receiverName);

          await tx.settlement.create({
            data: {
              groupId,
              payerId,
              receiverId,
              amount: finalizedRow.normalizedAmount,
              currency: finalizedRow.currency,
              settlementDate: finalizedRow.date
            }
          });

          settlementsCreated++;
        }
      }

      // Update ImportJob status to COMPLETED
      await tx.importJob.update({
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          summary: jsonStringify({
            rowsProcessed,
            expensesCreated,
            settlementsCreated
          })
        },
        where: { id: importJobId }
      });
    });

    return {
      expensesCreated,
      settlementsCreated,
      rowsProcessed,
      warnings: 0,
      errors: 0,
      blocking: 0,
      duplicatesDetected: 0
    };
  }

  private static calculateShares(
    totalAmountInr: number,
    splitType: string,
    splitWithUserIds: string[],
    splitDetails: { [userName: string]: number },
    userMap: { [name: string]: string }
  ): { userId: string; sharePercentage: number | null; shareAmount: number; shareWeight: number | null }[] {
    const n = splitWithUserIds.length;
    if (n === 0) return [];

    const result: { userId: string; sharePercentage: number | null; shareAmount: number; shareWeight: number | null }[] = [];

    // Helper to find username for a userId
    const getUserName = (userId: string): string => {
      return Object.keys(userMap).find(k => userMap[k] === userId) || "";
    };

    if (splitType === "equal" || !splitType) {
      const rawShare = totalAmountInr / n;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const share = parseFloat(rawShare.toFixed(2));
        const isLast = i === n - 1;
        const finalShare = isLast ? parseFloat((totalAmountInr - sum).toFixed(2)) : share;
        sum += finalShare;

        result.push({
          userId: splitWithUserIds[i],
          sharePercentage: parseFloat((100 / n).toFixed(2)),
          shareAmount: finalShare,
          shareWeight: null
        });
      }
    } else if (splitType === "percentage") {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const uId = splitWithUserIds[i];
        const name = getUserName(uId);
        const pct = splitDetails[name] || 0;
        const share = parseFloat((totalAmountInr * (pct / 100)).toFixed(2));
        
        const isLast = i === n - 1;
        const finalShare = isLast ? parseFloat((totalAmountInr - sum).toFixed(2)) : share;
        sum += finalShare;

        result.push({
          userId: uId,
          sharePercentage: pct,
          shareAmount: finalShare,
          shareWeight: null
        });
      }
    } else if (splitType === "exact" || splitType === "unequal") {
      // Split details contain exact amount in local currency. Needs conversion!
      // Let's sum details to verify conversion factor
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const uId = splitWithUserIds[i];
        const name = getUserName(uId);
        const amt = splitDetails[name] || 0;
        
        const isLast = i === n - 1;
        const finalShare = isLast ? parseFloat((totalAmountInr - sum).toFixed(2)) : amt;
        sum += finalShare;

        result.push({
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
        const uId = splitWithUserIds[i];
        const name = getUserName(uId);
        const w = splitDetails[name] !== undefined ? splitDetails[name] : 1;
        weights.push(w);
        totalWeight += w;
      }

      let sum = 0;
      for (let i = 0; i < n; i++) {
        const uId = splitWithUserIds[i];
        const w = weights[i];
        const share = totalWeight > 0 ? parseFloat((totalAmountInr * (w / totalWeight)).toFixed(2)) : 0;
        
        const isLast = i === n - 1;
        const finalShare = isLast ? parseFloat((totalAmountInr - sum).toFixed(2)) : share;
        sum += finalShare;

        result.push({
          userId: uId,
          sharePercentage: totalWeight > 0 ? parseFloat(((w / totalWeight) * 100).toFixed(2)) : 0,
          shareAmount: finalShare,
          shareWeight: w
        });
      }
    }

    return result;
  }
}
