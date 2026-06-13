# Shared Expense Manager (RetiX)

A production-grade shared expense application capable of importing a deliberately corrupted CSV dataset, detecting anomalies, handling them transparently, and generating explainable balances.

## Tech Stack

- **Frontend**: Vite + React + TypeScript + TailwindCSS + Axios
- **Backend**: Node.js + Express + TypeScript + Prisma ORM + Zod
- **Database**: PostgreSQL (Neon in production, SQLite dev fallback)
- **Deployment**: Vercel (Frontend), Railway (Backend), Neon (Database)

## Architecture

```text
       Frontend (React + TS)
                │
                ▼ (Axios API calls)
       Backend (Express + TS)
                │
                ├─► Anomaly Engine (Pluggable Rules)
                ├─► Decision Engine (Versioned Policies)
                ├─► Balance & Debt Engine (Min Cash Flow)
                ▼
      PostgreSQL / SQLite Database (via Prisma ORM)
```

## Features

1. **Pluggable Anomaly Engine**: Detects duplicates, fuzzy duplicates (using Levenshtein Distance), missing currency, negative refund amounts, unknown users, missing payers, and invalid split sums.
2. **Interactive Preview Queue**: Anomalies are surfaced for manual human-in-the-loop review. Users map users, choose date formats, approve duplicates, or convert settlements.
3. **Soft Membership History**: Automatically excludes members from splits if they were not active on the expense date (`joinedAt <= date AND (leftAt IS NULL OR date <= leftAt)`).
4. **Explainable Balances & Audit Trail**: Users can click any balance to inspect the exact transactions, payments, and settlements that compose their balance.
5. **Debt Simplification**: Implements a Cash Flow Minimization algorithm.

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

*Note: To run on PostgreSQL instead of SQLite, execute `node prisma/switch-db.js postgres` and update the `DATABASE_URL` in `.env` before running migrations.*

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

## Deployment

- **Database**: Neon (PostgreSQL serverless)
- **Backend**: Railway (Express server)
- **Frontend**: Vercel (React static SPA)

## AI Tools Used

- **Antigravity by DeepMind**: Employed for codebase architecture design, backend coding, React frontend compilation, and database schema refinement.
