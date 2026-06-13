export interface RawCsvRow {
  date: string;
  description: string;
  paid_by: string;
  amount: string;
  currency: string;
  split_type: string;
  split_with: string;
  split_details: string;
  notes: string;
  rowNumber: number;
}

export interface NormalizedRow {
  rowNumber: number;
  date: Date | null;             // Date parsed, null if ambiguous/invalid
  rawDateStr: string;
  isDateAmbiguous: boolean;
  description: string;
  paidBy: string;                 // User name (normalized: trimmed, capitalized)
  originalAmount: number;         // Parsed number, absolute value (negatives flag refund candidate)
  isNegative: boolean;
  currency: string;               // Normalized (e.g. INR, USD)
  exchangeRate: number;           // Converted rate (default 1.0)
  normalizedAmount: number;       // INR amount: originalAmount * exchangeRate
  splitType: string;              // equal, percentage, exact, share, weight
  splitWith: string[];            // List of normalized member names
  splitDetails: { [key: string]: number }; // Map of name -> value (percent, exact, weight)
  notes: string;
}

export interface AnomalyResult {
  rowNumber: number;
  fingerprint: string;
  severity: "INFO" | "WARNING" | "ERROR" | "BLOCKING";
  anomalyType: string;
  description: string;
  policyType: "DUPLICATE" | "CURRENCY" | "SETTLEMENT" | "MEMBERSHIP" | "DATE" | "USER" | "SPLIT";
  policyVersion: number;
  rawRow: RawCsvRow;
  normalizedRow: Partial<NormalizedRow>;
}
