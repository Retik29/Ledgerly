import { RawCsvRow, NormalizedRow, AnomalyResult } from "../imports/types";

export interface ImportContext {
  existingUsers: string[]; // List of user names registered in database
  memberships: {
    [userName: string]: { joinedAt: Date; leftAt: Date | null }[];
  };
  otherParsedRows: NormalizedRow[]; // Other rows in the same CSV upload
  existingExpenses: {
    id: string;
    date: Date;
    amount: number;
    paidBy: string;
    description: string;
  }[]; // Pre-existing expenses in database
}

export interface AnomalyRule {
  detect(
    raw: RawCsvRow,
    normalized: NormalizedRow,
    context: ImportContext
  ): AnomalyResult[];
}

// Helper: Levenshtein distance
export function getLevenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1].toLowerCase() === s2[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function getDescriptionSimilarity(s1: string, s2: string): number {
  const clean1 = s1.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  const clean2 = s2.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  if (clean1 === clean2) return 1.0;
  const dist = getLevenshteinDistance(clean1, clean2);
  const maxLen = Math.max(clean1.length, clean2.length);
  if (maxLen === 0) return 1.0;
  return 1.0 - dist / maxLen;
}

// 1. Duplicate Detection Rule (Confidence Level Based)
export class DuplicateRule implements AnomalyRule {
  detect(raw: RawCsvRow, normalized: NormalizedRow, context: ImportContext): AnomalyResult[] {
    const anomalies: AnomalyResult[] = [];
    const dateStr = normalized.date ? normalized.date.toISOString().split("T")[0] : null;
    if (!dateStr) return []; // Skip duplicate check if date is completely unparseable

    // Function to check matches against another expense
    const checkMatch = (other: { date: Date; amount: number; paidBy: string; description: string; rowNumber?: number }, isDb: boolean) => {
      const otherDateStr = other.date.toISOString().split("T")[0];
      if (dateStr !== otherDateStr) return null;

      const amountMatches = Math.abs(normalized.originalAmount - other.amount) < 0.01;
      const payerMatches = normalized.paidBy.toLowerCase() === other.paidBy.toLowerCase();
      const sim = getDescriptionSimilarity(normalized.description, other.description);

      if (amountMatches && payerMatches) {
        if (sim >= 0.8) {
          return { confidence: "HIGH" as const, desc: `Duplicate of row ${other.rowNumber || "in DB"} ('${other.description}') - identical date, amount, payer, and description` };
        } else if (sim >= 0.4) {
          return { confidence: "MEDIUM" as const, desc: `Potential duplicate of row ${other.rowNumber || "in DB"} ('${other.description}') - identical date, amount, payer, with similar description` };
        }
      } else if (amountMatches && sim >= 0.8) {
        // Different payer but same date, amount, similar description (e.g. Rows 24 vs 25)
        return { confidence: "LOW" as const, desc: `Conflicting entry matching row ${other.rowNumber || "in DB"} ('${other.description}') - same date and amount, similar description, but different payer (${normalized.paidBy} vs ${other.paidBy})` };
      }
      return null;
    };

    // Check against other rows in the same file
    for (const other of context.otherParsedRows) {
      if (other.rowNumber === normalized.rowNumber) continue;
      if (!other.date) continue;

      const match = checkMatch({
        date: other.date,
        amount: other.originalAmount,
        paidBy: other.paidBy,
        description: other.description,
        rowNumber: other.rowNumber
      }, false);

      if (match) {
        // To avoid double-reporting duplicates (e.g. reporting row 5 matches 6 AND row 6 matches 5),
        // we only report it on the LATER row (higher row number).
        if (normalized.rowNumber > other.rowNumber) {
          anomalies.push({
            rowNumber: normalized.rowNumber,
            fingerprint: `DUPLICATE_ROW_${normalized.rowNumber}_WITH_${other.rowNumber}`,
            severity: match.confidence === "HIGH" ? "WARNING" : "INFO",
            anomalyType: "DUPLICATE",
            description: `[${match.confidence} CONFIDENCE] ${match.desc}`,
            policyType: "DUPLICATE",
            policyVersion: 1,
            rawRow: raw,
            normalizedRow: normalized
          });
        }
      }
    }

    // Check against database pre-existing expenses
    for (const other of context.existingExpenses) {
      const match = checkMatch(other, true);
      if (match) {
        anomalies.push({
          rowNumber: normalized.rowNumber,
          fingerprint: `DUPLICATE_ROW_${normalized.rowNumber}_WITH_DB_${other.id}`,
          severity: match.confidence === "HIGH" ? "WARNING" : "INFO",
          anomalyType: "DUPLICATE",
          description: `[${match.confidence} CONFIDENCE] Database conflict: ${match.desc}`,
          policyType: "DUPLICATE",
          policyVersion: 1,
          rawRow: raw,
          normalizedRow: normalized
        });
      }
    }

    return anomalies;
  }
}

// 2. Missing Payer Rule
export class MissingPayerRule implements AnomalyRule {
  detect(raw: RawCsvRow, normalized: NormalizedRow): AnomalyResult[] {
    if (!raw.paid_by.trim()) {
      return [{
        rowNumber: normalized.rowNumber,
        fingerprint: `MISSING_PAYER_ROW_${normalized.rowNumber}`,
        severity: "ERROR",
        anomalyType: "MISSING_PAYER",
        description: "Payer is missing/empty. Human validation is required to designate a payer.",
        policyType: "USER",
        policyVersion: 1,
        rawRow: raw,
        normalizedRow: normalized
      }];
    }
    return [];
  }
}

// 3. Ambiguous Date Rule
export class AmbiguousDateRule implements AnomalyRule {
  detect(raw: RawCsvRow, normalized: NormalizedRow): AnomalyResult[] {
    if (normalized.isDateAmbiguous) {
      return [{
        rowNumber: normalized.rowNumber,
        fingerprint: `AMBIGUOUS_DATE_ROW_${normalized.rowNumber}`,
        severity: "WARNING",
        anomalyType: "AMBIGUOUS_DATE",
        description: `Ambiguous date format: '${raw.date}'. Please specify whether this represents DD-MM-YYYY or MM-DD-YYYY.`,
        policyType: "DATE",
        policyVersion: 1,
        rawRow: raw,
        normalizedRow: normalized
      }];
    }
    if (!normalized.date && raw.date.trim()) {
      // Unparseable date
      return [{
        rowNumber: normalized.rowNumber,
        fingerprint: `INVALID_DATE_ROW_${normalized.rowNumber}`,
        severity: "BLOCKING",
        anomalyType: "INVALID_DATE",
        description: `Unparseable date: '${raw.date}'. This row cannot be imported until the date is corrected.`,
        policyType: "DATE",
        policyVersion: 1,
        rawRow: raw,
        normalizedRow: normalized
      }];
    }
    return [];
  }
}

// 4. Missing Currency Rule
export class MissingCurrencyRule implements AnomalyRule {
  detect(raw: RawCsvRow, normalized: NormalizedRow): AnomalyResult[] {
    if (!raw.currency.trim()) {
      return [{
        rowNumber: normalized.rowNumber,
        fingerprint: `MISSING_CURRENCY_ROW_${normalized.rowNumber}`,
        severity: "INFO",
        anomalyType: "MISSING_CURRENCY",
        description: "Missing currency indicator. Defaulted to INR.",
        policyType: "CURRENCY",
        policyVersion: 1,
        rawRow: raw,
        normalizedRow: normalized
      }];
    }
    return [];
  }
}

// 5. Negative Amount Rule (Refund)
export class NegativeAmountRule implements AnomalyRule {
  detect(raw: RawCsvRow, normalized: NormalizedRow): AnomalyResult[] {
    if (normalized.isNegative) {
      return [{
        rowNumber: normalized.rowNumber,
        fingerprint: `NEGATIVE_AMOUNT_ROW_${normalized.rowNumber}`,
        severity: "INFO",
        anomalyType: "NEGATIVE_AMOUNT",
        description: `Negative amount of ${raw.amount} detected. Row processed as a refund candidate.`,
        policyType: "SPLIT",
        policyVersion: 1,
        rawRow: raw,
        normalizedRow: normalized
      }];
    }
    return [];
  }
}

// 6. Settlement Disguised as Expense Rule
export class SettlementDisguisedAsExpenseRule implements AnomalyRule {
  detect(raw: RawCsvRow, normalized: NormalizedRow): AnomalyResult[] {
    const keywords = ["repaid", "paid back", "settled", "returned", "returned back"];
    const descLower = normalized.description.toLowerCase();
    const hasKeyword = keywords.some(k => descLower.includes(k));

    if (hasKeyword) {
      return [{
        rowNumber: normalized.rowNumber,
        fingerprint: `SETTLEMENT_DISGUISED_AS_EXPENSE_ROW_${normalized.rowNumber}`,
        severity: "WARNING",
        anomalyType: "SETTLEMENT_DISGUISED_AS_EXPENSE",
        description: `Description indicates a debt repayment: '${raw.description}'. Convert this expense to a direct Settlement transaction?`,
        policyType: "SETTLEMENT",
        policyVersion: 1,
        rawRow: raw,
        normalizedRow: normalized
      }];
    }
    return [];
  }
}

// 7. Membership Violation Rule
export class MembershipViolationRule implements AnomalyRule {
  detect(raw: RawCsvRow, normalized: NormalizedRow, context: ImportContext): AnomalyResult[] {
    const anomalies: AnomalyResult[] = [];
    if (!normalized.date) return []; // Inactive member validation requires a valid date

    const expenseDate = normalized.date;

    const checkMemberActive = (name: string): boolean => {
      const history = context.memberships[name];
      if (!history || history.length === 0) {
        // If they have no membership history at all but they are in the database,
        // it means they are registered. We should check if they have a generic membership.
        return false;
      }
      return history.some(m => {
        const joined = new Date(m.joinedAt);
        const left = m.leftAt ? new Date(m.leftAt) : null;
        return expenseDate >= joined && (left === null || expenseDate <= left);
      });
    };

    // Check split members
    for (const member of normalized.splitWith) {
      // Only check membership if the user actually exists in database
      if (context.existingUsers.includes(member)) {
        if (!checkMemberActive(member)) {
          anomalies.push({
            rowNumber: normalized.rowNumber,
            fingerprint: `MEMBERSHIP_VIOLATION_${member.toUpperCase()}_ROW_${normalized.rowNumber}`,
            severity: "ERROR",
            anomalyType: "MEMBERSHIP_VIOLATION",
            description: `Inactive membership: '${member}' was not active in the group on date ${expenseDate.toISOString().split("T")[0]}.`,
            policyType: "MEMBERSHIP",
            policyVersion: 1,
            rawRow: raw,
            normalizedRow: normalized
          });
        }
      }
    }

    return anomalies;
  }
}

// 8. Zero Amount Rule
export class ZeroAmountRule implements AnomalyRule {
  detect(raw: RawCsvRow, normalized: NormalizedRow): AnomalyResult[] {
    if (normalized.originalAmount === 0) {
      return [{
        rowNumber: normalized.rowNumber,
        fingerprint: `ZERO_AMOUNT_ROW_${normalized.rowNumber}`,
        severity: "WARNING",
        anomalyType: "ZERO_AMOUNT",
        description: "Expense amount is ₹0. Flagged as suspicious transactions.",
        policyType: "SPLIT",
        policyVersion: 1,
        rawRow: raw,
        normalizedRow: normalized
      }];
    }
    return [];
  }
}

// 9. Invalid Split Totals Rule
export class InvalidSplitTotalsRule implements AnomalyRule {
  detect(raw: RawCsvRow, normalized: NormalizedRow): AnomalyResult[] {
    const type = normalized.splitType;
    const details = normalized.splitDetails;
    const amount = normalized.originalAmount;

    if (type === "percentage") {
      const sum = Object.values(details).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.01) {
        return [{
          rowNumber: normalized.rowNumber,
          fingerprint: `INVALID_PERCENT_SPLIT_ROW_${normalized.rowNumber}`,
          severity: "BLOCKING",
          anomalyType: "INVALID_PERCENT_SPLIT",
          description: `Invalid percentage split: sum is ${sum}%, expected 100%. Row cannot be imported until resolved.`,
          policyType: "SPLIT",
          policyVersion: 1,
          rawRow: raw,
          normalizedRow: normalized
        }];
      }
    } else if (type === "unequal" || type === "exact") {
      const sum = Object.values(details).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - amount) > 0.01) {
        return [{
          rowNumber: normalized.rowNumber,
          fingerprint: `INVALID_EXACT_SPLIT_ROW_${normalized.rowNumber}`,
          severity: "BLOCKING",
          anomalyType: "INVALID_EXACT_SPLIT",
          description: `Invalid exact split: sum is ${sum}, expected ${amount}. Row cannot be imported until resolved.`,
          policyType: "SPLIT",
          policyVersion: 1,
          rawRow: raw,
          normalizedRow: normalized
        }];
      }
    }
    return [];
  }
}

// 10. Unknown User Rule
export class UnknownUserRule implements AnomalyRule {
  detect(raw: RawCsvRow, normalized: NormalizedRow, context: ImportContext): AnomalyResult[] {
    const anomalies: AnomalyResult[] = [];

    const checkUser = (name: string, role: "PAYER" | "PARTICIPANT") => {
      if (!name) return;
      if (!context.existingUsers.includes(name)) {
        anomalies.push({
          rowNumber: normalized.rowNumber,
          fingerprint: `UNKNOWN_USER_${name.toUpperCase()}_ROW_${normalized.rowNumber}`,
          severity: "ERROR",
          anomalyType: "UNKNOWN_USER",
          description: `Unknown user '${name}' detected as ${role.toLowerCase()}. Review required to map or create.`,
          policyType: "USER",
          policyVersion: 1,
          rawRow: raw,
          normalizedRow: normalized
        });
      }
    };

    if (normalized.paidBy) {
      checkUser(normalized.paidBy, "PAYER");
    }

    for (const member of normalized.splitWith) {
      checkUser(member, "PARTICIPANT");
    }

    return anomalies;
  }
}
