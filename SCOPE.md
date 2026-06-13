# SCOPE.md - Database Schema & Anomaly Log

## Database Schema

```sql
User (id UUID PK, name, email, password_hash, created_at)
Group (id UUID PK, name, created_by UUID FK, created_at)
GroupMembership (id UUID PK, group_id UUID FK, user_id UUID FK, joined_at, left_at)
Expense (id UUID PK, group_id UUID FK, title, description, amount, currency, exchange_rate, normalized_amount, paid_by UUID FK, expense_date, split_type, imported, created_at, deleted_at)
ExpenseParticipant (id UUID PK, expense_id UUID FK, user_id UUID FK, share_percentage, share_amount, share_weight)
Settlement (id UUID PK, group_id UUID FK, payer_id UUID FK, receiver_id UUID FK, amount, currency, settlement_date, created_at, deleted_at)
ImportJob (id UUID PK, raw_file_name, raw_file_hash, status, uploaded_at, started_at, completed_at, summary JSON)
ImportAnomaly (id UUID PK, import_job_id UUID FK, row_number, fingerprint, severity, anomaly_type, description, raw_row JSON, normalized_row JSON, status, resolved_by UUID FK, resolved_at, resolution_note, policy_type, policy_version, resolution_action)
AuditLog (id UUID PK, entity_type, entity_id UUID, action, performed_by UUID, before_state JSON, after_state JSON, created_at)
```

## CSV Anomaly Log

Below is the list of anomalies discovered in the `expenses_export.csv` file, our detection strategy, and handling policy.

| Row | Anomaly | Severity | Detection Strategy | Handling / Resolution Policy |
| :--- | :--- | :--- | :--- | :--- |
| **5 vs 6** | Duplicate / Fuzzy | `WARNING` | Description similarity (Levenshtein Distance) | Surface in Review Queue. User rejects one row, marked `REJECTED_ROW`. |
| **7** | Quoted Amount with Commas | `INFO` | Regex check for commas in strings | Normalized automatically: parsed `"1,200"` $\rightarrow$ `1200`. |
| **10** | Sub-penny amount (`899.995`) | `WARNING` | Check decimal places exceeding 2 | Auto-rounded to 2 decimal places (`900.00`) and logged. |
| **11** | Unknown User (`Priya S`) | `ERROR` | Database match check on active names | Placed in Review Queue. User maps to registered user `Priya` (`MAPPED_USER`). |
| **13** | Missing Payer | `ERROR` | Checked empty `paid_by` | Review Required. User chooses payer in preview panel. |
| **14** | Repayment as Expense | `WARNING` | Keyword matching (`repaid`, `paid back`) | Converted to Settlement (`Rohan -> Aisha 5000`). |
| **15** | Invalid Percent Split (110%) | `BLOCKING` | Sum of percentages check | Blocked import until user adjusts percentages to 100%. |
| **20, 21** | Converted Currency (USD) | `INFO` | Currency check != `INR` | Multiplied by default exchange rate of `83.0` INR/USD. Rate adjustable in UI. |
| **23** | Unknown User (`Dev's friend Kabir`) | `ERROR` | Database match check | User maps to existing user or registers a member. |
| **24 vs 25** | Conflicting Duplicate | `WARNING` | Date, amount, fuzzy description matches | High confidence conflict. User selects winner or imports both. |
| **26** | Negative Amount (Refund) | `INFO` | Checked amount < 0 | Flagged as refund. Reduces net balance of participants. |
| **27** | Invalid Date Format (`Mar-14`) | `INFO` | Alternate date syntax matching | Auto-normalized to `14-03-2026` based on chronological year. |
| **27** | lowercase/trailing space name | `INFO` | Whitespace and lowercase check | Auto-normalized `rohan ` $\rightarrow$ `Rohan`. |
| **28** | Missing Currency | `INFO` | Checked empty `currency` | Defaulted to `INR` and flagged warning. |
| **31** | Zero Amount (`₹0`) | `WARNING` | Checked amount === 0 | Kept record, flagged warning in dashboard. |
| **34** | Chronologically out of bounds / ambiguous date | `WARNING` | Sequential bounds matching | Marked ambiguous. User explicitly confirms April 5th vs May 4th. |
| **36** | Membership Violation (Meera) | `ERROR` | Active membership bounds check | Excluded Meera from splits, recalculated split with other members. |
| **42** | Split details on equal split | `INFO` | Split type equal with details | Redundant details ignored, equal split applied. |
