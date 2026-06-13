# DECISIONS.md - Decision Log

## 1. Database Engine Switcher (SQLite fallback)

- **Options Considered**:
  1. PostgreSQL only (requires active local Postgres database connection or Neon URL during developer setup).
  2. SQLite only (does not match production requirement).
  3. Dynamic Switcher (maintains separate SQLite and Postgres schemas and offers a single node switcher script).
- **Choice**: Options 3.
- **Reason**: Guarantees zero local dependency blockers during initial setup (runs SQLite dev.db out of the box), while keeping the schema fully compatible with production PostgreSQL (Neon).

---

## 2. CSV Upload Method

- **Options Considered**:
  1. Multipart/form-data upload using `multer` (stores temp files in backend filesystem).
  2. Raw Text Payload POST (client reads file as string in browser and posts JSON package).
- **Choice**: Option 2.
- **Reason**: Simplifies backend infrastructure. Serverless instances (Vercel/Railway) don't need persistent disk permissions. Prevents upload path bugs.

---

## 3. Date Normalization Policy (Ambiguous vs Unambiguous)

- **Options Considered**:
  1. Auto-interpret all dates (e.g. assume `04-05-2026` is DD-MM-YYYY).
  2. Fail on all non-ISO dates.
  3. Safe parser: Normalize unambiguous styles (e.g., `Mar-14` $\rightarrow$ `14-03-2026`) and flag ambiguous styles (e.g., `04-05-2026` where day/month order is unclear) as warnings for manual user selection.
- **Choice**: Option 3.
- **Reason**: Honors Spreetail's criteria of *no silent corrections* and *human-in-the-loop validation* while keeping the data entry flow clean.

---

## 4. Unknown User Resolution Policy

- **Options Considered**:
  1. Auto-create missing users.
  2. Reject rows containing unknown users immediately.
  3. Flag as anomaly, halt auto-import, and require user to map the unknown name to an active user via UI selection.
- **Choice**: Option 3.
- **Reason**: Prevents system pollution with misspelled duplicate names (e.g. `Priya S` mapped to `Priya`, `rohan ` to `Rohan`).

---

## 5. Exchange Rate Policy

- **Options Considered**:
  1. Fixed static exchange rate (83.0 INR/USD).
  2. Call a live exchange rate API.
  3. Default to historical rate of 83.0 INR/USD but offer manual adjustment in the Review Queue.
- **Choice**: Option 3.
- **Reason**: Provides auditability (fixed default historical rate ensures imports run consistently) and flexibility (user can override rate to match credit card statements).

---

## 6. Financial Soft Deletes

- **Options Considered**:
  1. Hard delete when user removes transactions.
  2. Soft deletes via `deletedAt` timestamp.
- **Choice**: Option 2.
- **Reason**: Preserves audit trail for import reviews. Reversing or audit logging transactions remains traceable.
