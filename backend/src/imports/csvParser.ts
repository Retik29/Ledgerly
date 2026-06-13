import { RawCsvRow } from "./types";

export class CsvParser {
  /**
   * Parses raw CSV text into typed RawCsvRow objects.
   * Preserves exact row numbers (1-indexed, matching CSV line number).
   */
  static parse(csvText: string): RawCsvRow[] {
    const lines = csvText.split(/\r?\n/);
    if (lines.length === 0) return [];

    // Parse header to find index mapping
    const headerLine = lines[0];
    const headers = this.parseCsvLine(headerLine).map(h => h.trim().toLowerCase());

    const result: RawCsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue; // Skip blank lines

      const values = this.parseCsvLine(line);
      const rowNum = i + 1; // 1-indexed, header is row 1

      // Map headers to raw row fields
      const row: Partial<RawCsvRow> = { rowNumber: rowNum };
      
      // Default mappings
      row.date = this.getValueByHeader(headers, values, "date");
      row.description = this.getValueByHeader(headers, values, "description");
      row.paid_by = this.getValueByHeader(headers, values, "paid_by");
      row.amount = this.getValueByHeader(headers, values, "amount");
      row.currency = this.getValueByHeader(headers, values, "currency");
      row.split_type = this.getValueByHeader(headers, values, "split_type");
      row.split_with = this.getValueByHeader(headers, values, "split_with");
      row.split_details = this.getValueByHeader(headers, values, "split_details");
      row.notes = this.getValueByHeader(headers, values, "notes");

      result.push(row as RawCsvRow);
    }

    return result;
  }

  private static parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        // Toggle quote status
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        // Commas outside of quotes split the values
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current); // Push final value
    return result;
  }

  private static getValueByHeader(headers: string[], values: string[], headerName: string): string {
    const index = headers.indexOf(headerName);
    if (index === -1 || index >= values.length) return "";
    // Clean outer quotes if any, trim whitespace
    let val = values[index].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1).trim();
    }
    return val;
  }
}
