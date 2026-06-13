import { RawCsvRow, NormalizedRow, AnomalyResult } from "../imports/types";
import {
  ImportContext,
  AnomalyRule,
  DuplicateRule,
  MissingPayerRule,
  AmbiguousDateRule,
  MissingCurrencyRule,
  NegativeAmountRule,
  SettlementDisguisedAsExpenseRule,
  MembershipViolationRule,
  ZeroAmountRule,
  InvalidSplitTotalsRule,
  UnknownUserRule
} from "./rules";

export class AnomalyEngine {
  private rules: AnomalyRule[] = [];

  constructor() {
    // Register all standard rules
    this.rules.push(new MissingPayerRule());
    this.rules.push(new AmbiguousDateRule());
    this.rules.push(new MissingCurrencyRule());
    this.rules.push(new NegativeAmountRule());
    this.rules.push(new SettlementDisguisedAsExpenseRule());
    this.rules.push(new ZeroAmountRule());
    this.rules.push(new InvalidSplitTotalsRule());
    this.rules.push(new UnknownUserRule());
    this.rules.push(new MembershipViolationRule());
    this.rules.push(new DuplicateRule());
  }

  /**
   * Runs the anomaly pipeline for all parsed CSV rows.
   */
  detectAll(
    rawRows: RawCsvRow[],
    normalizedRows: NormalizedRow[],
    context: ImportContext
  ): AnomalyResult[] {
    const allAnomalies: AnomalyResult[] = [];

    // Run rules for each row
    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const normalized = normalizedRows[i];

      for (const rule of this.rules) {
        const rowAnomalies = rule.detect(raw, normalized, context);
        allAnomalies.push(...rowAnomalies);
      }
    }

    return allAnomalies;
  }
}
