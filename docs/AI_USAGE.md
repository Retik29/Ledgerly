# AI-Assisted Development Report: Ledgerly

## 1. AI Tools Used
During the development of Ledgerly, AI tools were used to accelerate code generation, boilerplate setup, and algorithm optimization:
- **Cursor AI / GitHub Copilot**: Utilized for real-time autocomplete, generating frontend skeleton elements, and writing initial Prisma schemas.
- **Claude 3.5 Sonnet**: Consulted for architectural patterns, writing complex SQL/Prisma transactions, and detailing mathematical logic for split models.
- **ChatGPT (GPT-4o)**: Used for generating regex patterns for the CSV parser and mock data structures for testing.

---

## 2. Tasks Where AI Was Helpful
- **Boilerplate and Interface Generation**: Writing standard CSS layouts and standard Express middleware guards was significantly faster.
- **Regex Generation**: Generating raw regular expressions to capture various date syntaxes (e.g. `YYYY-MM-DD`, `DD-MM-YYYY`, `MMM-DD`) in [normalizer.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/imports/normalizer.ts) was handled efficiently by Claude.
- **Greedy Matching Logic**: Generating the core mathematical structure of the cash flow minimization algorithm in [BalanceEngine.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/balances/balanceEngine.ts) was accelerated by generating the base debtor/creditor balancing loops.

---

## 3. Tasks Where AI Was Insufficient
- **Scoping Contexts & Multi-Tenant Boundaries**: Copilot and Claude consistently generated global query operations (e.g. `prisma.importJob.findMany()`) that completely missed the group scoping context. They failed to recognize that data from one group must never leak into another group, requiring manual intervention to wrap query operations with group membership guards.
- **SQLite Database Fallbacks**: Prisma-client-js handles PostgreSQL decimal constraints differently than SQLite. AI models routinely suggested using PostgreSQL `@db.Decimal` modifiers that crash SQLite environments. Manual design was required to maintain double-precision floats combined with manual rounding methods across the backend and frontend.

---

## 4. Examples of Incorrect AI Suggestions
- **Recursive Duplicate Detection**: When generating duplicate rules, Copilot suggested performing recursive description checks using Levenshtein distance on every row against every other row in an $O(N^2)$ nested loop without deduplication. This caused duplicate warnings to be reported twice (e.g. reporting row 5 is a duplicate of row 6, and row 6 is a duplicate of row 5). I corrected this by adding row index comparisons (`if (normalized.rowNumber > other.rowNumber)`) to report the warning only once.
- **Float Rounding in Map Iterators**: To calculate equal splits, Copilot suggested dividing the total amount by the number of participants directly:
  ```typescript
  const share = totalAmount / participants.length;
  ```
  This failed to account for division remainders (e.g. splitting 100 among 3 people). It resulted in database insertion failures due to mismatching transaction total constraints.

---

## 5. Human Decisions That Overrode AI
- **Review Queue State Machine**: The AI initial layouts recommended correcting statements in-place in the database immediately upon upload. I overrode this design by introducing an intermediate state machine (`ImportJob` and `ImportAnomaly` tables). This keeps raw uploads intact and hosts conflicts in a review queue until explicitly finalized.
- **Soft Deletion Architecture**: Copilot suggested performing `DELETE` operations on transactions. I overrode this to implement soft deletes (writing to `deletedAt` columns), preserving historical data for imports, splits, and audit trail consistency.

---

## 6. Debugging Sessions Performed Manually
- **Import Context Leakage**: Discovered that users in **Group B** could view import jobs uploaded in **Group A**. I manually traced this to `imports.ts` where the `GET /jobs` endpoint lacked filtering. I updated the schema to support `groupId` on the `ImportJob` table and added filtering based on user group memberships.
- **Prisma Transaction Rollbacks**: During imports testing, some anomaly saves caused database locks. I manually debugged the transaction block in [persistence.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/imports/persistence.ts), shifting user lookups outside the transaction context to keep transaction locks minimal.

---

## 7. Validation Steps Performed After AI-Generated Code
- **Automated Test Suite Suite**: Built [test-all.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/test-all.ts) to verify edge cases:
  - Ensured membership bounds correctly flag transaction dates.
  - Asserted that exact and percentage splits sum to 100% or the total amount.
  - Checked that the greedy settlement matching resolves debts in the minimum possible steps.
- **TypeScript Production Build compilation**: Executed `npm run build` in the React frontend to catch any implicit type violations or missing interfaces introduced during code generation.

---

## 8. Engineering Judgement Applied
- **CORS Configuration**: Restricting backend access origins specifically to the Vite dev server URL (`http://localhost:5173`) and staging clients rather than wildcard `*` settings suggested by AI templates.
- **Input Validation Sanitization**: Enforcing strict Zod validation schemas on incoming API payloads, blocking malformed data before it reaches Prisma or the database layer.
- **Atomic Operations**: Ensuring database writes run within atomic operations (`prisma.$transaction`) to preserve ledger consistency.
