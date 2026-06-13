import { NormalizedRow } from "./types";

export interface ResolvedAnomaly {
  anomalyType: string;
  resolutionAction: "MAPPED_USER" | "APPROVED_DUPLICATE" | "REJECTED_ROW" | "CONVERTED_TO_SETTLEMENT" | "ACCEPTED_WARNING" | null;
  resolutionNote?: string | null;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  // Specific data passed to resolve
  // e.g. { selectedDate: "2026-04-05" } or { mappedUser: { from: "Priya S", to: "Priya" } } or { overriddenExchangeRate: 84.5 }
  resolutionDetails?: any;
}

export class DecisionEngine {
  /**
   * Applies the user's resolution decisions to a normalized row.
   * Returns a finalized data structure ready for DB persistence, or null if the row was rejected.
   */
  static processRow(
    normalized: NormalizedRow,
    resolutions: ResolvedAnomaly[]
  ): {
    action: "PERSIST_EXPENSE" | "PERSIST_SETTLEMENT" | "REJECT";
    finalizedRow: NormalizedRow;
    auditNotes: string[];
  } {
    const finalized = { ...normalized };
    const auditNotes: string[] = [];
    let action: "PERSIST_EXPENSE" | "PERSIST_SETTLEMENT" | "REJECT" = "PERSIST_EXPENSE";

    for (const res of resolutions) {
      if (res.resolutionAction === "REJECT_ROW") {
        action = "REJECT";
        auditNotes.push(`Row ${normalized.rowNumber} rejected: ${res.resolutionNote || "No note provided"}`);
        break; // Stop further processing if rejected
      }

      if (res.resolutionAction === "CONVERTED_TO_SETTLEMENT") {
        action = "PERSIST_SETTLEMENT";
        auditNotes.push(`Row ${normalized.rowNumber} converted to settlement: ${res.resolutionNote || "Debt repayment detected"}`);
      }

      if (res.resolutionAction === "MAPPED_USER" && res.resolutionDetails) {
        const { from, to } = res.resolutionDetails;
        if (from && to) {
          // Check if payer matches
          if (finalized.paidBy === from) {
            finalized.paidBy = to;
            auditNotes.push(`Mapped payer '${from}' to '${to}'`);
          }
          // Check if members list matches
          finalized.splitWith = finalized.splitWith.map(member => {
            if (member === from) {
              return to;
            }
            return member;
          });
          // Update split details dictionary keys
          if (finalized.splitDetails[from] !== undefined) {
            finalized.splitDetails[to] = finalized.splitDetails[from];
            delete finalized.splitDetails[from];
          }
        }
      }

      if (res.resolutionAction === "ACCEPTED_WARNING" && res.resolutionDetails) {
        // Handle ambiguous date override
        if (res.anomalyType === "AMBIGUOUS_DATE" && res.resolutionDetails.selectedDate) {
          finalized.date = new Date(res.resolutionDetails.selectedDate);
          finalized.isDateAmbiguous = false;
          auditNotes.push(`Resolved ambiguous date: set to ${res.resolutionDetails.selectedDate}`);
        }
        // Handle exchange rate override
        if (res.anomalyType === "CURRENCY_CONVERSION" && res.resolutionDetails.overriddenExchangeRate) {
          const rate = parseFloat(res.resolutionDetails.overriddenExchangeRate);
          if (!isNaN(rate)) {
            finalized.exchangeRate = rate;
            finalized.normalizedAmount = parseFloat((finalized.originalAmount * rate).toFixed(2));
            auditNotes.push(`Overrode exchange rate: set to ${rate}`);
          }
        }
      }
    }

    return {
      action,
      finalizedRow: finalized,
      auditNotes
    };
  }
}
