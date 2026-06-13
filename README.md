# Shared Expense Manager (RetiX)

A production-grade shared expense application capable of importing a deliberately corrupted CSV dataset, detecting anomalies, handling them transparently, and generating explainable balances.

## Tech Stack

- **Frontend**: Vite + React + TypeScript + TailwindCSS + Axios
- **Backend**: Node.js + Express + TypeScript + Prisma ORM + Zod
- **Database**: PostgreSQL (Neon in production, SQLite dev fallback)
- **Deployment**: Vercel (Frontend), Railway (Backend), Neon (Database)

## Architecture Diagram

```text
               +───────────────────────────+
               │   Frontend (React + TS)   │
               +─────────────┬─────────────+
                             │
                             │ (Axios HTTPS Requests)
                             ▼
               +───────────────────────────+
               │   Backend (Express + TS)  │
               +─────────────┬─────────────+
                             │
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
+──────────────+      +──────────────+      +──────────────+
│Anomalies     │      │Decision      │      │Balance & Debt│
│Engine        │      │Engine        │      │Engine        │
+──────────────+      +──────────────+      +──────────────+
       │                     │                     │
       └─────────────────────┼─────────────────────┘
                             ▼
               +───────────────────────────+
               │   Prisma ORM Interface    │
               +─────────────┬─────────────+
                             │
                             ▼
               +───────────────────────────+
               │  PostgreSQL / SQLite DB   │
               +───────────────────────────+
```

## Import Lifecycle

```text
Raw CSV File Uploaded
      │
      ▼
Parsed into Raw Objects (preserves row numbers)
      │
      ▼
Normalized (trim names, check currencies, format unambiguous dates)
      │
      ▼
Anomaly Check (runs duplicate, date, user, currency, and membership checks)
      │
      ▼
Review Queue (human-in-the-loop maps users, overrides exchange rates, resolves conflicts)
      │
      ▼
Finalized & Committed (within atomic database transaction, rounding penny adjusted)
      │
      ▼
Net Balances Recalculation & Cash Flow Minimization Debt Plan
```

## Known Limitations

- **Floating Point Precision**: SQLite doesn't natively support Decimal types. We enforce type compatibility by using standard `Float` double-precision numbers across both environments, which are rounded to 2 decimal places client-side and server-side to guarantee precision.
- **Concurrent Imports**: Simultaneous uploads of identical files by different users are queued; however, hash-based regression block checks prevent duplicate persistence.

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Initialize the dev database (SQLite fallback) and run migrations & seed:
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```
4. Start the backend development server:
   ```bash
   npm run dev
   ```
   *(Running at `http://localhost:4000`)*

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
3. Start the frontend development server:
   ```bash
   npm run dev
   ```
   *(Running at `http://localhost:5173`)*
