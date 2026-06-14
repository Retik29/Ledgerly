# Project Submission Report: Ledgerly

## Project Goal
Ledgerly is a self-hosted, multi-user expense reconciliation platform designed to manage group expenses and process bulk banking statements. Its primary goal is to provide a robust data import pipeline that validates statement exports, flags logical and financial anomalies, and enables a "human-in-the-loop" review queue to correct data issues (e.g. date ambiguity, name discrepancies, or math splits) before committing transactions.

---

## Implemented Features
- **Multi-User Account Access**: JWT-based session security and Bcrypt registration/login.
- **Group & Membership Management**: Creating groups and managing active memberships. Tracks entrance/exit bounds to validate transaction dates.
- **Dynamic Split Engines**: Supports Equal, Percentage, Exact, and Weighted splitting strategies.
- **Financial Balance Engine**: Dynamically calculates total spent and net positions for each group member.
- **Cash Flow Minimization**: Minimizes transactions required to settle balances using a greedy matching algorithm.
- **Anomaly Detection pipeline**: Automatically parses CSV statement inputs and flags ten types of errors or warning candidates.
- **Interactive Review Queue**: Side-by-side dashboard drawer allowing users to map names, resolve dates, correct splits, and override exchange rates.
- **Audit Logging**: Logs all database modifications and CSV import decisions.
- **DB Switcher**: Allows swapping the active ORM schema between SQLite and PostgreSQL.

---

## Architecture Summary
The application follows a standard decoupled Client-Server architecture:
- **Frontend**: Single Page Application (SPA) built with Vite, React 18, TypeScript, and TailwindCSS. Communication with the backend is handled via Axios ([api.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/frontend/src/services/api.ts)).
- **Backend**: REST API built with Node.js, Express, and TypeScript. Route validation is enforced using Zod schemas.
- **Database Layer**: Prisma ORM interacting with an SQLite database file (`dev.db`) in development, migratable to PostgreSQL in production.

---

## Key Technical Decisions
1. ** intermediate State Ingestion**: Imported files are held in an intermediate state (`ImportJob` and `ImportAnomaly` tables) rather than committed directly. This enables a review queue, preventing database contamination from invalid entries.
2. **Double-Precision Float Storage**: Used Float columns for transaction values to ensure schema compatibility between SQLite and PostgreSQL. Manual client-side and server-side rounding logic is implemented to prevent floating-point accumulation drift.
3. **Atomic Transaction commits**: CSV finalizations are wrapped in a single database transaction (`prisma.$transaction`). If a single row fails resolution, the entire session rolls back.

---

## Anomaly Detection Categories Supported
1. **Missing Payer**: Empty `paid_by` column.
2. **Ambiguous Date**: Date format is unclear (e.g., `04-05-2026`).
3. **Invalid Date**: Date string is completely unparseable.
4. **Missing Currency**: Defaults currency to `INR` and flags a warning.
5. **Negative Amount**: Cost is negative (refund candidate).
6. **Disguised Settlement**: Description keywords (e.g. `"repaid"`, `"settled"`) suggesting a repayment.
7. **Zero Amount**: Cost is exactly ₹0.
8. **Invalid Split Math**: Split totals do not sum to 100% or the total transaction amount.
9. **Unknown User**: Payer or participant name is not in the database.
10. **Membership Boundary Violation**: Transaction date falls outside a participant's active group membership range.

*Note: Fuzzy duplicate checking compares descriptions against database records and other rows in the same upload using Levenshtein Distance.*

---

## Human Review Workflow
If an upload contains anomalies, it is marked as `REVIEW_REQUIRED`. The user resolves conflicts in the review panel:
- **Remapping Names**: Maps unknown names to existing registered users. The remapping is applied consistently to all fields (payer, participants, and split details).
- **Date Confirmation**: Explicitly selects the correct date format (DD/MM/YYYY vs. MM/DD/YYYY).
- **Settlement Conversion**: Converts flagged repayments directly into a `Settlement` transaction.
- **Exchange Rate Adjustments**: Overrides the default exchange rate ($83.0$) for non-INR currencies.
- **Split Math Normalization**: Adjusts percentages to sum to exactly 100%.

Finalizing the import applies these overrides, recalculates user shares, and writes the transactions to the database.

---

## Settlement Engine Overview
Calculations are handled by [BalanceEngine.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/balances/balanceEngine.ts):
- **Balance Calculation**: Accumulates total paid expenses, paid settlements, owed shares, and received settlements for each user.
- **Simplification Algorithm**: Pairs the largest debtor with the largest creditor, settles the maximum possible amount, and repeats the process until all balances are resolved. This cash flow minimization runs in $O(N \log N)$ complexity.

---

## Data Integrity Measures
- **Transaction Rollbacks**: Prisma transaction blocks roll back database writes if any entry fails validation.
- **Penny Rounding Adjustments**: When splitting indivisible amounts, the difference between the rounded sum and the total cost is applied to the last participant, preventing rounding drift.
- **Row Signatures**: Computes a SHA-256 hash of each row to prevent duplicate uploads of the same transaction.

---

## Security Measures
- **JWT Authorization**: Enforces JWT verification via middleware for all API endpoints.
- **Access Control**: Checks group membership before returning group metadata or creating transactions.
- **Cascade Deletes**: Configured database foreign keys with cascade deletions to prevent orphaned records.
- **Input Validation**: Uses Zod validation schemas on incoming API payloads.

---

## Major Bugs Found & Resolved
1. **Cross-Group Data Leakage**: Discovered that users could view and finalize import jobs belonging to other groups.
   - *Resolution*: Added a `groupId` field to the `ImportJob` table, updated the upload endpoint to save the `groupId`, and modified the list endpoint to filter jobs based on group membership.
2. **Leaking Duplicate Warnings**: Found that fuzzy duplicate warnings were logged twice (e.g. reporting row 5 is a duplicate of row 6, and row 6 is a duplicate of row 5).
   - *Resolution*: Added row index checks (`if (normalized.rowNumber > other.rowNumber)`) to report the warning only once.

---

## Testing Performed
- **Automated Tests**: Developed a suite of 27 assertions in [test-all.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/test-all.ts) checking database seeds, authentication, membership bounds, CSV parsing, anomaly detection, split math calculations, and debt simplification.
- **Build Verification**: Verified that the React client compiles cleanly with zero TypeScript errors.

---

## Known Limitations
- **SQLite Floating Point**: Lacks native decimal types, requiring manual rounding logic in the codebase.
- **Vast Imports**: Client-side CSV reading can cause browser performance issues for uploads exceeding 10,000 rows.

---

## Future Work
- **Dynamic Schema Customization**: Support custom column configurations for varied CSV layouts.
- **Receipt OCR Integration**: Support scanning receipt images to pre-populate manual expenses.
- **Exchange Rate API Integration**: Fetch real-time exchange rates for non-INR currencies.

---

## AI Usage Summary
AI tools (Claude, ChatGPT, and Copilot) were used to generate boilerplate code, regular expressions, and base logic loops. Standard architecture design, multi-group security scoping, decimal workaround configurations, error handling, and tests were written and verified manually.

---

## Conclusion
Ledgerly provides a robust, self-hosted option for group expense reconciliation. The implementation successfully handles corrupted bulk statement uploads through a reliable pipeline, validation logic, and an intuitive human-in-the-loop review queue.
