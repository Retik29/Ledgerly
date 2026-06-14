import { prisma } from "../shared/prisma";
import { RawCsvRow, NormalizedRow } from "./types";
import { CsvParser } from "./csvParser";
import { Normalizer } from "./normalizer";
import { DecisionEngine, ResolvedAnomaly } from "./decisionEngine";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";

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
  public static computeRowSignature(
    groupId: string,
    date: Date | null,
    amount: number,
    paidBy: string,
    splitWith: string[],
    description: string
  ): string {
    const dateStr = date ? date.toISOString().split("T")[0] : "";
    const sortedParticipants = splitWith.slice().sort().join(",");
    const cleanDesc = description.trim().toLowerCase();
    const cleanPaidBy = paidBy.trim().toLowerCase();

    const dataString = `${groupId}|${dateStr}|${amount}|${cleanPaidBy}|${sortedParticipants}|${cleanDesc}`;
    return crypto.createHash("sha256").update(dataString).digest("hex");
  }

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
      // Build a global alias map from ALL MAPPED_USER resolutions: { "Dev's friend kabir" -> "Dev" }
      // This is the fallback for any name that DecisionEngine missed remapping.
      const globalAlias: Record<string, string> = {};
      for (const res of resolutions) {
        if (res.resolutionAction === "MAPPED_USER" && res.resolutionDetails?.from !== undefined && res.resolutionDetails?.to) {
          const aliasFrom = Normalizer.normalizeName(res.resolutionDetails.from || "");
          const aliasTo   = Normalizer.normalizeName(res.resolutionDetails.to);
          if (aliasFrom) globalAlias[aliasFrom] = aliasTo;
          // Also store un-normalized key so raw names match
          const rawFrom = (res.resolutionDetails.from as string).trim();
          if (rawFrom) globalAlias[rawFrom] = res.resolutionDetails.to as string;
        }
      }

      // Group resolutions by row number (extracted from fingerprint e.g. UNKNOWN_USER_FOO_ROW_23)
      const rowResolutionsMap = new Map<number, ResolvedAnomaly[]>();
      for (const res of resolutions) {
        if (!res.anomalyType) continue;
        const match = res.anomalyType.match(/_ROW_(\d+)/);
        if (match) {
          const rowNum = parseInt(match[match.length - 1], 10);
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

        // Map names to user IDs — three tiers:
        // 1. Direct lookup by normalized name
        // 2. Follow globalAlias (from MAPPED_USER resolutions) then look up
        // 3. Throw only if both fail
        const getUserId = (name: string): string => {
          const normalizedName = Normalizer.normalizeName(name);
          let id = userMap[normalizedName];
          if (id) return id;

          // Tier 2: check global alias map (covers cases DecisionEngine missed)
          const aliasedName = globalAlias[name] || globalAlias[normalizedName];
          if (aliasedName) {
            const aliasedNorm = Normalizer.normalizeName(aliasedName);
            id = userMap[aliasedNorm];
            if (id) {
              console.log(`[PERSISTENCE] Alias fallback: '${name}' → '${aliasedName}' on row ${rowNum}`);
              return id;
            }
          }

          throw new Error(`User '${name}' on row ${rowNum} could not be resolved. Please map this user in the anomaly resolution queue before finalizing.`);

        };


        if (action === "PERSIST_EXPENSE") {
          // Verify date is set
          if (!finalizedRow.date) {
            throw new Error(`Cannot persist expense on row ${rowNum}: date is missing or ambiguous.`);
          }

          const payerId = getUserId(finalizedRow.paidBy);

          // Resolve all split members to user IDs, deduplicate if mapping caused collisions
          // e.g. "Dev's friend kabir" → "Dev" AND "Dev" already in list → merge
          const seenUserIds = new Set<string>();
          const dedupedSplitWith: string[] = [];
          const dedupedSplitDetails: { [name: string]: number } = {};

          for (const member of finalizedRow.splitWith) {
            const uid = getUserId(member);
            if (seenUserIds.has(uid)) {
              // Merge: find the existing name for this userId and add shares
              const existingName = dedupedSplitWith.find(n => {
                try { return getUserId(n) === uid; } catch { return false; }
              });
              if (existingName && finalizedRow.splitDetails[member] !== undefined) {
                dedupedSplitDetails[existingName] = (dedupedSplitDetails[existingName] || 0) + (finalizedRow.splitDetails[member] || 0);
              }
              console.log(`[PERSISTENCE] Merged duplicate participant '${member}' (same userId as existing entry) on row ${rowNum}`);
            } else {
              seenUserIds.add(uid);
              dedupedSplitWith.push(member);
              if (finalizedRow.splitDetails[member] !== undefined) {
                dedupedSplitDetails[member] = finalizedRow.splitDetails[member];
              }
            }
          }

          const deduped = { ...finalizedRow, splitWith: dedupedSplitWith, splitDetails: dedupedSplitDetails };
          const splitUserIds = deduped.splitWith.map(member => getUserId(member));

          // Calculate participant shares
          const shares = this.calculateShares(
            deduped.normalizedAmount,
            deduped.splitType,
            splitUserIds,
            deduped.splitDetails,
            userMap
          );

          // Compute deterministic rowSignature
          const rowSignature = PersistenceService.computeRowSignature(
            groupId,
            finalizedRow.date,
            finalizedRow.originalAmount,
            finalizedRow.paidBy,
            finalizedRow.splitWith,
            finalizedRow.description
          );

          // Check if it already exists in the DB for this group
          const existingExpense = await tx.expense.findFirst({
            where: {
              groupId,
              rowSignature
            }
          });

          if (existingExpense) {
            console.log(`[PERSISTENCE:DEDUPLICATION] Skipping duplicate row signature ${rowSignature} for row ${rowNum} ('${finalizedRow.description}')`);
            continue; // Skip insertion, do NOT affect balances, continue to next row!
          }

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
              imported: true,
              rowSignature: rowSignature
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
