# Technical Design Document: Ledgerly

## 1. System Overview
Ledgerly is a self-hosted, multi-user expense reconciliation platform designed to manage and resolve shared group expenses. It features a pipeline to ingest, clean, and audit financial transaction statements uploaded via CSV files. The platform is built around a "human-in-the-loop" anomaly resolution workflow. This workflow ensures that corrupted, ambiguous, or invalid data (e.g., misspelled names, date ambiguity, or mathematical split rounding errors) is flagged, reviewed, and normalized before database persistence.

---

## 2. Functional Requirements
- **User Authentication**: Secure user registration and session management via JWT.
- **Group Management (Reconciliation Accounts)**: Creating groups, managing active memberships, and tracking historical membership bounds (`joinedAt` and `leftAt`).
- **Manual Expense Logging**: Creating individual expenses with equal, exact, percentage, or weighted participant split options.
- **Settlement Recording**: Logging peer-to-peer repayments to settle outstanding group balances.
- **CSV Data Normalization & Import**: Parsing banking statement exports, converting custom date formats, mapping inconsistent currencies, and matching unknown names.
- **Anomaly Detection**: Scanning statement uploads for fuzzy duplicates, ambiguous dates, inactive member splits, and zero-amount entries.
- **Interactive Review Queue**: Providing an interface for users to resolve conflicts, map names, and override exchange rates.
- **Audit Trails**: Recording every transaction change, CSV import override, and deletion in a queryable audit log table.
- **Debt Simplification**: Computing the net balances of all group users and minimizing transactions using a cash flow minimization algorithm.

---

## 3. Non-Functional Requirements
- **Data Consistency**: Ensuring that imports commit atomically via database transactions. If one row fails or is rejected, the entire session rolls back.
- **Floating-Point Precision**: Enforcing 2-decimal rounding boundaries across both database models and client calculations to prevent rounding drift.
- **Scalability and Portability**: Using a schema switcher to run SQLite locally (for zero-dependency setup) and PostgreSQL in staging/production.
- **Responsive Web Interface**: Offering visual feedback for dashboard charts, CSV preview grids, and the anomaly resolution drawers.

---

## 4. Architecture Diagram

```text
                               +─────────────────────────────────────────+
                               │          Client Layer (Vite + React)    │
                               │  - App.tsx (Main UI State Controller)   │
                               │  - api.ts (Axios HTTP Client Wrapper)   │
                               +────────────────────┬────────────────────+
                                                    │
                                                    │ (HTTP/HTTPS JSON Payloads)
                                                    ▼
                               +─────────────────────────────────────────+
                               │         Backend Layer (Node + Express)  │
                               │  - index.ts (Server Config & Mounts)    │
                               │  - authMiddleware.ts (JWT Auth Guard)   │
                               +────────────────────┬────────────────────+
                                                    │
                                                    ▼
                               +─────────────────────────────────────────+
                               │             Service Layer               │
                     ┌─────────┤ - CsvParser.ts      - Normalizer.ts     ├─────────┐
                     │         │ - AnomalyEngine.ts  - DecisionEngine.ts │         │
                     │         +────────────────────┬────────────────────+         │
                     ▼                              │                              ▼
        +─────────────────────────+                 │                +─────────────────────────+
        │   BalanceEngine.ts      │                 │                │   PersistenceService.ts │
        │   - Balance Calculation │                 │                │   - Transaction Commits │
        │   - Debt Simplification │                 │                │   - Penny Adjustments   │
        +─────────────────────────+                 ▼                +─────────────────────────+
                                       +─────────────────────────+
                                       │   Prisma ORM Client     │
                                       +────────────┬────────────+
                                                    │
                                                    ▼
                                       +─────────────────────────+
                                       │  PostgreSQL / SQLite    │
                                       +─────────────────────────+
```

---

## 5. Frontend Design
The client is a Single Page Application (SPA) built using **React, TypeScript, and TailwindCSS**, defined in [App.tsx](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/frontend/src/App.tsx).
- **Core View States**: The UI state is governed by a central state variable `view`:
  - `login` / `register`: Authentication forms.
  - `dashboard`: Displays overall receivables/payables and the list of reconciliation accounts (groups).
  - `group-detail`: Contains sub-tabs for group overview, expenses, settlements, members, balances, and imports history.
  - `import`: Houses the step-by-step statement uploading, parsing, anomaly reviewing, and finalized importing.
  - `admin-demo`: Shows log lists, diagnostic details, and audit tables for administrators.
- **UI State Coordination**: Using a monolithic client state layout ensures that changes in the active group immediately cascade to update the balances, current members, settlements, and raw statements. An API utility ([api.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/frontend/src/services/api.ts)) handles authentication tokens, attaching a Bearer token interceptor to outgoing HTTP requests.

---

## 6. Backend Design
The server uses **Node.js and Express** built with **TypeScript**, split into distinct domain routers:
- **`authRouter`** ([auth.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/auth/auth.ts)): Manages JWT registration, logins, and session fetching (`/auth/me`).
- **`groupsRouter`** ([groups.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/groups/groups.ts)): Mounts CRUD endpoints for managing reconciliation accounts.
- **`membershipsRouter`** ([memberships.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/memberships/memberships.ts)): Manages user-to-group associations, mapping dates to memberships and handling soft-leaves (marking `leftAt`).
- **`expensesRouter` / `settlementsRouter`**: Handles logging transactions, soft-deleting logs (sets `deletedAt`), and writing details to the AuditLog.
- **`importsRouter`** ([imports.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/imports/imports.ts)): Handles the multipart statement processing pipeline.

---

## 7. Database Schema Explanation
The database schema utilizes Prisma models to structure data consistently between SQLite and PostgreSQL:
- **`User`**: Core account information. Connects to group creations, active memberships, paid expenses, and settlements.
- **`Group`**: The main container representing a reconciliation account.
- **`GroupMembership`**: A joint table matching a User to a Group. Uses a unique constraint `@@unique([groupId, userId, joinedAt])` to track distinct active intervals.
- **`Expense` & `ExpenseParticipant`**: Stores financial entries. The participant table records individual shares, percentage values, and weights, allowing historical recalculations.
- **`ImportJob` & `ImportAnomaly`**: Tracks CSV statements and their associated errors or warning items.
- **`AuditLog`**: Tracks historical changes, logging the affected entity, action types (CREATE, UPDATE, DELETE, RESOLVE), and JSON before/after state representations.

---

## 8. Expense Settlement Algorithm
The calculation of balances and simplified debt settlement is executed inside the [BalanceEngine.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/balances/balanceEngine.ts) module:

### Balance Summarization
1. For each group user, the engine initializes a `UserBalanceSummary` structure, tracking paid expenses, paid settlements, owed shares, and received settlements.
2. It processes active expenses and settlements.
3. For each expense, it adds the total amount to the payer's `totalPaidExpenses` and matches participant weights, adding the corresponding owed portion to their `totalOwedExpenses`.
4. The net balance is computed as:
   $$\text{netBalance} = (\text{totalPaidExpenses} + \text{totalPaidSettlements}) - (\text{totalOwedExpenses} + \text{totalReceivedSettlements})$$

### Debt Simplification Algorithm
To minimize peer-to-peer cash flows, the platform uses a greedy matching algorithm:
1. Divide users into two lists based on their net balance:
   - **Debtors** ($\text{netBalance} < -0.01$) sorted in ascending order (most negative first).
   - **Creditors** ($\text{netBalance} > 0.01$) sorted in descending order (most positive first).
2. Pair the largest debtor with the largest creditor:
   - Calculate $\text{settledAmount} = \min(|\text{debtor.balance}|, \text{creditor.balance})$.
   - Deduct $\text{settledAmount}$ from the debtor's debt and the creditor's credit.
   - Record a transaction instruction: `Debtor -> Creditor: settledAmount`.
   - Remove any party whose balance gets close to zero ($< 0.01$).
3. Repeat step 2 until all debts are resolved. This matching operates in $O(N \log N)$ complexity.

---

## 9. CSV Import Architecture
The import pipeline is handled by [PersistenceService.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/imports/persistence.ts):
- **Parser**: [CsvParser.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/imports/csvParser.ts) reads raw string inputs, handling escaping, quoted fields, and commas.
- **Normalizer**: [Normalizer.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/imports/normalizer.ts) trims whitespace, normalizes date strings (e.g. `Mar-14` is converted to standard format), and defaults missing currencies to `INR`.
- **Deduplication Signature**: To prevent duplicate uploads of the same transaction, the engine computes a SHA-256 hash (`rowSignature`) based on the row details:
  $$\text{hash}(\text{groupId} \mid \text{date} \mid \text{amount} \mid \text{paidBy} \mid \text{sortedParticipants} \mid \text{description})$$
  If an entry matching this signature already exists in the database, the import skips the row during finalize, preventing duplicate database writes.

---

## 10. Anomaly Detection Architecture
Anomalies are evaluated by the [AnomalyEngine.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/anomalies/anomalyEngine.ts) using ten distinct rule classes registered in [rules.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/anomalies/rules.ts):
1. **Missing Payer**: Flags rows with an empty `paid_by` column.
2. **Ambiguous Date**: Flags dates where day/month order is unclear (e.g., `04-05-2026`).
3. **Invalid Date**: Blocks imports if the date format is completely unparseable.
4. **Missing Currency**: Warns if the currency is absent, defaulting it to `INR`.
5. **Negative Amount**: Identifies refunds and flags them for balance subtraction.
6. **Disguised Settlement**: Flags description keywords (e.g., `"repaid"`, `"settled"`) suggesting a repayment.
7. **Zero Amount**: Flags rows with zero-cost values.
8. **Invalid Split Math**: Checks if custom percentage/exact splits do not add up to 100% or the total amount.
9. **Unknown User**: Compares payer and participant names against the database, flagging mismatches.
10. **Membership Boundary Violations**: Verifies if the transaction date falls outside a participant's active group membership range.

### Description Similarity Calculation
Fuzzy duplication uses the **Levenshtein Distance** algorithm to calculate a similarity score between descriptions:
$$\text{similarity} = 1.0 - \frac{\text{LevenshteinDistance}(\text{desc1}, \text{desc2})}{\max(\text{len1}, \text{len2})}$$
- $\ge 80\%$: High confidence duplicate.
- $40\% - 80\%$: Medium confidence duplicate.
- $< 40\%$: Non-duplicate.

---

## 11. Human Review Architecture
If the anomaly check returns error or warning records, the system marks the `ImportJob` status as `REVIEW_REQUIRED`. The frontend renders these anomalies in a side-by-side review panel:
- **`MAPPED_USER`**: The user selects an existing user to map the unknown name to. This populates a global alias map so the remapping applies consistently across all fields (payer, participants, and split details).
- **`ACCEPTED_WARNING`**: The user specifies their choice for ambiguous parameters (e.g., selecting the correct date option or overriding the exchange rate).
- **`CONVERTED_TO_SETTLEMENT`**: The user approves converting the row to a direct peer-to-peer settlement, skipping expense split logic.
- **`CORRECTED_PERCENT_SPLIT`**: The user resolves split math errors by adjusting percentages to equal exactly 100%.

The resolutions are submitted to `POST /imports/:id/finalize`. The backend processes them through the `DecisionEngine` and persists the finalized data inside an atomic transaction.

---

## 12. Security Design
- **Authenticated Endpoints**: Secure routes utilize the `authMiddleware` guard, extracting JWT session details from authorization headers or HTTP cookies.
- **Access Authorization**: Before returning detailed group metadata or creating entries, endpoints check that the requester is a member of the group. For example:
  ```typescript
  const membership = await prisma.groupMembership.findFirst({
    where: { groupId, userId }
  });
  if (!membership) return res.status(403).json({ error: "Access denied." });
  ```
- **Database Safety**: Prisma parameterizes all queries automatically, preventing SQL injection. Cross-Origin Resource Sharing (CORS) origins are strictly limited to the Vite dev and production clients.

---

## 13. Error Handling Strategy
- **Global Error Middleware**: A centralized error handler in [index.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/index.ts) catches unhandled exceptions, logs the details, and returns a sanitized JSON response:
  ```typescript
  app.use((err, req, res, next) => {
    console.error("Global server error:", err);
    res.status(500).json({ error: err.message || "An unexpected error occurred." });
  });
  ```
- **Database Transactions**: File persistence wraps all write operations inside `prisma.$transaction`. Any runtime exception (e.g. mapping failure or database violation) automatically triggers a rollback, keeping the database in a clean state.
- **Toast Notifications**: Frontend failures catch API rejection promises, display user-friendly toast overlays detailing the error message, and log details to the developer console.

---

## 14. Testing Strategy
Ledgerly implements a consolidated automated test suite in [test-all.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/test-all.ts):
- **Database Validation**: Checks that database migrations and default data seed correctly.
- **Authentication Validation**: Validates registration, Bcrypt hashing, and JWT token signing/verification.
- **Membership Boundary Validation**: Verifies that active membership bounds correctly identify whether a user is active or inactive on a specific date.
- **CSV Parser & Anomaly Engine Validation**: Verifies that the CSV parser, normalizer, and anomaly engine correctly identify missing payers, currency defaults, fuzzy duplicates, and disguised settlements.
- **Split Calculation Validation**: Asserts that split calculations for equal, percentage, exact, and weighted splits are accurate.
- **Debt Simplification Validation**: Validates the greedy cash flow minimization algorithm outputs.

---

## 15. Scalability Considerations
- **Index Optimization**: Query operations should have database indexes placed on frequently queried fields like `groupId`, `userId`, `expenseDate`, and `rowSignature`.
- **Compute Offloading**: The `BalanceEngine` calculations are done dynamically. For very large groups, these calculations should be cached or pre-computed incrementally upon transaction addition/deletion.
- **Database Scalability**: The Prisma database switcher allows the app to migrate from SQLite to PostgreSQL. This supports concurrent transaction workloads and scaling database storage in production environments.

---

## 16. Tradeoffs Made
- **Centralized Client State**: Storing all UI page routing and data states in `App.tsx` makes state sharing easy, but increases component size and can trigger unnecessary re-renders. A state management tool (like Redux or Zustand) would be cleaner but adds configuration overhead.
- **Client-Side CSV Reading**: Transmitting the parsed CSV structure in a single payload simplifies backend hosting, but can cause page freezing if importing massive spreadsheets (over 10,000 rows).
- **Float Data Types**: Using double-precision Float fields avoids SQLite connection limitations, but requires manual rounding logic across all calculations to prevent floating-point comparison issues.

---

## 17. Future Enhancements
- **Dynamic CSV Schema Mapping**: Allowing users to select which column names map to standard fields during import, supporting varied statement layouts.
- **Detailed Audit Visualizer**: Implementing a UI view to browse audit log entries, compare entity states, and revert individual actions.
- **Real-Time Exchange Rates**: Integrating a currency converter API to pull live exchange rates for non-INR transactions.
