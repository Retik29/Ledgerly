import { RawCsvRow, NormalizedRow } from "./types";

export class Normalizer {
  /**
   * Normalizes a raw CSV row into a NormalizedRow.
   * Does NOT perform advanced anomaly checks, just parses and cleans raw values.
   */
  static normalize(raw: RawCsvRow): NormalizedRow {
    const rowNumber = raw.rowNumber;

    // 1. Normalize currency
    let currency = raw.currency.trim().toUpperCase();
    if (!currency) {
      currency = "INR"; // Inferred, but will flag warning
    }

    // 2. Parse and normalize amount
    // Clean commas, quotes, and whitespace
    const cleanedAmountStr = raw.amount.replace(/,/g, "").trim();
    let originalAmount = parseFloat(cleanedAmountStr);
    if (isNaN(originalAmount)) {
      originalAmount = 0;
    }

    const isNegative = originalAmount < 0;
    // Store absolute value for processing, flag negative for refunds
    originalAmount = Math.abs(originalAmount);

    // 3. Exchange rate default logic
    const exchangeRate = currency === "USD" ? 83.0 : 1.0;
    const normalizedAmount = parseFloat((originalAmount * exchangeRate).toFixed(2));

    // 4. Normalize payer name
    const paidBy = this.normalizeName(raw.paid_by);

    // 5. Parse split list
    const splitWith = raw.split_with
      ? raw.split_with.split(";").map(n => this.normalizeName(n)).filter(n => n.length > 0)
      : [];

    // 6. Parse split details
    const splitDetails = this.parseSplitDetails(raw.split_details);

    // 7. Parse date
    const dateResult = this.parseDate(raw.date);

    return {
      rowNumber,
      date: dateResult.date,
      rawDateStr: raw.date,
      isDateAmbiguous: dateResult.isAmbiguous,
      description: raw.description.trim(),
      paidBy,
      originalAmount,
      isNegative,
      currency,
      exchangeRate,
      normalizedAmount,
      splitType: raw.split_type.trim().toLowerCase(),
      splitWith,
      splitDetails,
      notes: raw.notes.trim()
    };
  }

  /**
   * Capitalizes first letter, trims spaces.
   */
  static normalizeName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "";
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }

  /**
   * Parses various date formats.
   * Ambiguous format: e.g. 04-05-2026.
   * Unambiguous formats:
   *   - 2026-04-05
   *   - Mar-14 (Appends default year 2026)
   *   - 14 March 2026
   */
  private static parseDate(dateStr: string): { date: Date | null; isAmbiguous: boolean } {
    const trimmed = dateStr.trim();
    if (!trimmed) {
      return { date: null, isAmbiguous: false };
    }

    // 1. Check for standard DD-MM-YYYY or MM-DD-YYYY pattern (e.g., 04-05-2026)
    const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
    const dmyMatch = trimmed.match(dmyRegex);
    if (dmyMatch) {
      const part1 = parseInt(dmyMatch[1], 10);
      const part2 = parseInt(dmyMatch[2], 10);
      const year = parseInt(dmyMatch[3], 10);

      // If both parts are <= 12 and not equal, it is ambiguous (e.g. 04-05-2026)
      if (part1 <= 12 && part2 <= 12 && part1 !== part2) {
        return { date: null, isAmbiguous: true };
      }

      // If part1 > 12, it must be DD-MM-YYYY
      if (part1 > 12) {
        return { date: new Date(Date.UTC(year, part2 - 1, part1)), isAmbiguous: false };
      }

      // If part2 > 12, it must be MM-DD-YYYY
      if (part2 > 12) {
        return { date: new Date(Date.UTC(year, part1 - 1, part2)), isAmbiguous: false };
      }

      // If they are equal (e.g. 05-05-2026), it's not ambiguous
      return { date: new Date(Date.UTC(year, part1 - 1, part2)), isAmbiguous: false };
    }

    // 2. Check for YYYY-MM-DD pattern (e.g. 2026-04-05) - Unambiguous
    const ymdRegex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
    const ymdMatch = trimmed.match(ymdRegex);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10);
      const day = parseInt(ymdMatch[3], 10);
      return { date: new Date(Date.UTC(year, month - 1, day)), isAmbiguous: false };
    }

    // 3. Check for MMM-DD or DD-MMM pattern (e.g. Mar-14, 14-Mar) - Unambiguous
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthMap: { [key: string]: number } = {};
    months.forEach((m, idx) => { monthMap[m] = idx; });

    const mdmRegex = /^([a-zA-Z]{3})[-/](\d{1,2})$/;
    const mdmMatch = trimmed.match(mdmRegex);
    if (mdmMatch) {
      const mStr = mdmMatch[1].toLowerCase();
      const day = parseInt(mdmMatch[2], 10);
      if (monthMap[mStr] !== undefined) {
        // Assume default year 2026 based on spreadsheet context
        return { date: new Date(Date.UTC(2026, monthMap[mStr], day)), isAmbiguous: false };
      }
    }

    const dmmRegex = /^(\d{1,2})[-/]([a-zA-Z]{3})$/;
    const dmmMatch = trimmed.match(dmmRegex);
    if (dmmMatch) {
      const day = parseInt(dmmMatch[1], 10);
      const mStr = dmmMatch[2].toLowerCase();
      if (monthMap[mStr] !== undefined) {
        return { date: new Date(Date.UTC(2026, monthMap[mStr], day)), isAmbiguous: false };
      }
    }

    // 4. Try JS Native Date parsing for phrases like "14 March 2026"
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) {
      const d = new Date(parsed);
      // Ensure we treat it as UTC day
      return { date: new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), isAmbiguous: false };
    }

    // Default: could not parse date at all (treated as error date anomaly)
    return { date: null, isAmbiguous: false };
  }

  /**
   * Parses split details string: e.g. "Rohan 700; Priya 400; Meera 400"
   */
  private static parseSplitDetails(detailsStr: string): { [key: string]: number } {
    const result: { [key: string]: number } = {};
    if (!detailsStr.trim()) return result;

    const parts = detailsStr.split(";");
    for (const part of parts) {
      const trimmedPart = part.trim();
      if (!trimmedPart) continue;

      // Match name followed by a number (optionally with percentage sign)
      // e.g. "Rohan 700", "Aisha 30%", "Aisha 1"
      const match = trimmedPart.match(/^(.+?)\s+(\d+(?:\.\d+)?%?)$/);
      if (match) {
        const name = this.normalizeName(match[1]);
        let valStr = match[2];
        let val = parseFloat(valStr.replace("%", ""));
        if (isNaN(val)) val = 0;
        result[name] = val;
      }
    }

    return result;
  }
}
