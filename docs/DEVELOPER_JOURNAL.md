# Developer Engineering Journal: Ledgerly

## Entry 1: Initial Project Understanding & Assumptions
*Date: 2026-06-13 (Morning)*

Starting development on **Ledgerly** today. The user wants a shared expense manager that handles bulk statement imports from CSVs.
At first glance, it seems like a basic Splitwise clone, but the core requirement is handling a corrupted dataset. The system must find duplicates, correct dates, map users, and compute balances cleanly.

### Initial Assumptions:
1. **Direct Parsing**: I can parse the CSV files and write them to the database immediately. If there is an error (e.g., misspelled user), I can simply throw a 400 error in the API.
2. **Simple Schema**: A basic `User`, `Group`, `Expense`, and `Participant` table layout will cover the requirements.
3. **Floating Point Arithmetic**: Javascript `number` types will be fine for calculations.

### Reality Check:
- *Throwing 400 errors* on import failure is a terrible experience for bulk statements. If a CSV has 50 rows and row 43 has a typo, blocking the entire upload forces the user to manually edit files in Excel. We need a "human-in-the-loop" review queue: parse first, flag anomalies, hold in a review state, and commit only after resolutions are submitted.
- *Floating point math* like `0.1 + 0.2 !== 0.3` will lead to discrepancies in debt splits. We must enforce strict 2-decimal rounding.

---

## Entry 2: Database Schema Evolution
*Date: 2026-06-13 (Afternoon)*

The database schema needs to support the import review queue state.
Initially, my schema design only had `User`, `Group`, and `Expense`.
I added `GroupMembership` to track active intervals. This is important: ifSam joins on April 8, he should not owe money for a dinner on February 15. The schema must record `joinedAt` and `leftAt`.

### Initial SQLite Migrations
Prisma was configured with SQLite as a development fallback. SQLite has some quirks:
- It has no native `Uuid` type (represented as strings).
- It lacks a native `Decimal` type. I had to use `Float` columns for transaction amounts and write manual rounding logic to handle floating-point issues.

### Adding Import Logs
To support the review queue, I added:
- `ImportJob`: Represents a statement upload session, tracking the current state (`status` values: `UPLOADED`, `ANALYZING`, `REVIEW_REQUIRED`, `COMPLETED`, `FAILED`).
- `ImportAnomaly`: Individual validation error rows linked to the import session. Storing `rawRow` and `normalizedRow` as stringified JSON lets us display details to the user and apply modifications.
- `AuditLog`: An audit table to log transaction additions, deletions, and overrides.

---

## Entry 3: CSV Parsing & Normalization Evolution
*Date: 2026-06-13 (Evening)*

The parser was initially just splitting lines by commas: `line.split(",")`.
This broke immediately on rows like:
`"2026-03-15","Dinner, Marina Bites","1,200.00","INR","Aisha"`
The comma inside the description and the comma in the amount string split the row into invalid columns.

### Fixing the Parser
I rewrote `CsvParser` ([csvParser.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/imports/csvParser.ts)) to parse quotes correctly. The parser iterates character-by-character:
- Toggle an `inQuotes` flag when hitting double quotes.
- Skip comma checks when `inQuotes` is active.
- Trim double quotes from the final field value.

### Writing the Normalizer
I built a `Normalizer` ([normalizer.ts](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/src/imports/normalizer.ts)) to handle data cleanups:
- Currency columns default to `INR` if empty.
- Cost strings with commas (e.g. `1,200`) have commas stripped before parsing.
- String dates (like `Mar-14`) are parsed using chronological lookups.

---

## Entry 4: Anomaly Detection Challenges

### Duplicate Detection
Identifying duplicates is straightforward when values are identical, but statements often have variations (e.g., `Dinner Marina` vs. `Dinner at Marina`).
- **Initial Try**: Match identical descriptions. This missed fuzzy matches.
- **The Fix**: Implemented **Levenshtein Distance** to compute similarity. Descriptions with $\ge 80\%$ similarity are flagged.
- **Deduplication Signature**: Added a SHA-256 signature check (`rowSignature`) based on the row details. This signature is verified before writing to the database, preventing duplicate uploads of the same transaction during finalization.

### Membership Validation
Verifying active group membership during splits was tricky.
- **The Challenge**: If an expense is split among all group users, but a member has historically left, the split calculation must exclude them.
- **The Fix**: Added `MembershipEngine.isMemberActiveOnDate` to check the transaction date against the member's `joinedAt`/`leftAt` intervals. The Anomaly Engine flags any inactive participants, and the persistence code automatically recalculates the split share for the remaining active users.

---

## Entry 5: Debugging the Cross-Group Data Leakage & ImportJob Context Bug
*Date: 2026-06-14 (Morning)*

### The Discovery
During multi-group testing, I encountered a security bug. I logged in, created **Group A**, and uploaded a statement. Then, I switched to **Group B** (a completely different group with different users) and went to the imports list. The import session from **Group A** was visible in **Group B**, and I could review and finalize the import, leaking transactions into the wrong group.

### The Debugging Process
I checked the `ImportJob` table in `schema.prisma`:
```prisma
model ImportJob {
  id           String          @id @default(uuid())
  rawFileName  String
  rawFileHash  String
  status       String          
  uploadedAt   DateTime        @default(now())
  startedAt    DateTime?
  completedAt  DateTime?
  summary      String?         
  
  // Relations
  anomalies ImportAnomaly[]
}
```
The database model lacked a `groupId` field! The import jobs were global entities. The import upload endpoint (`POST /imports/analyze`) took a `groupId` parameter in the body, but it was only used to build the context for checking user names and membership bounds. The created `ImportJob` was not scoped to any group.
Additionally, `GET /imports/jobs` fetched all jobs in the database:
```typescript
router.get("/jobs", async (req, res) => {
  const jobs = await prisma.importJob.findMany();
  return res.json(jobs);
});
```

### The Fix
I resolved the issue in three steps:

1. **Schema Update**: Added `groupId` to `ImportJob` in [schema.prisma](file:///c:/Users/retik/VSCODE/WEBDEV/Projects/Ledgerly/backend/prisma/schema.prisma):
   ```prisma
   model ImportJob {
     id           String          @id @default(uuid())
     groupId      String?         
     ...
     group     Group?          @relation(fields: [groupId], references: [id], onDelete: Cascade)
   }
   ```
2. **Scoping Uploads**: Modified `POST /imports/analyze` to require a `groupId` and store it in the newly created job.
3. **Filtering Queries**: Updated `GET /imports/jobs` to check group membership. It now fetches the user's group memberships and filters import jobs to return only those belonging to the user's groups:
   ```typescript
   router.get("/jobs", async (req: AuthenticatedRequest, res: Response) => {
     const userId = req.user?.id;
     
     // Find the user's groups
     const memberships = await prisma.groupMembership.findMany({
       where: { userId }
     });
     const groupIds = memberships.map(m => m.groupId);

     // Only return jobs scoped to the user's groups
     const jobs = await prisma.importJob.findMany({
       where: { groupId: { in: groupIds } },
       include: { anomalies: true },
       orderBy: { uploadedAt: "desc" }
     });
     return res.json(jobs);
   });
   ```

---

## Entry 6: Lessons Learned
1. **Scoping from the Start**: Always associate uploaded documents and imports with their context entity (e.g., `groupId`) at the database schema level. Relying on API parameters without database-level scoping leads to data leakage.
2. **Explicit Type Casting**: Avoid relying on implicit conversions. Explicitly rounding floating-point amounts at each calculation stage (paid vs. owed) is necessary to keep ledgers accurate.
3. **Write Scripts for DB States**: Having a simple query script (like the prisma query scripts) to verify database states after transaction executions is invaluable for debugging ORM-level transaction behaviors.
