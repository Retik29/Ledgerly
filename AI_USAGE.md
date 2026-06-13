# AI_USAGE.md - AI Collaboration Log

This document details the collaboration between the engineer of record and the AI assistant Antigravity (Gemini 3.5 Flash) during development.

## AI Tools Used

- **Antigravity (Gemini 3.5 Flash)**: Collaborative pair programmer.

## Core Prompts

1. **Initial Scaffold**: "Initialize backend project config, package.json, and Prisma schema matching the shared expense database specifications."
2. **Anomaly Engine**: "Build pluggable anomaly rules for duplicate confidence scoring, negative amount refund detection, and ambiguous date flags."
3. **Frontend Dashboard**: "Create a premium Slate-based admin React app that coordinates authentication, CSV previews, human-in-the-loop resolutions, and explainable balance traces."

---

## AI Mistakes & Corrections

Below are three concrete cases where the AI produced incorrect/suboptimal outputs, how they were caught, and the corrections applied.

### Mistake 1: Prisma Client Dynamic Update Typo

- **AI Output**:
  ```typescript
  await tx.importJob.update({
    value: { status: "COMPLETED", ... },
    where: { id: importJobId }
  });
  ```
- **How Caught**: TypeScript compilation warning or run-time crash in the persistence layer. Prisma does not have a `value` key in update options; it uses `data`.
- **Correction**: Replaced `value` with `data` in `persistence.ts`.

### Mistake 2: Missing types/node in Frontend Vite Compilation

- **AI Output**: Regenerated the React build without adding `@types/node` to frontend dependencies.
- **How Caught**: Vite React production build failed with:
  ```text
  error TS2688: Cannot find type definition file for 'node'.
  ```
- **Correction**: Installed `@types/node` in the frontend directory and disabled strict unused variable linting rules (`noUnusedLocals: false`, `noUnusedParameters: false` in `tsconfig.app.json`) to allow smooth development.

### Mistake 3: Equal Split Rounding Precision Loss

- **AI Output**: Initially, the equal split division did not adjust for the final decimal penny:
  ```typescript
  const share = totalAmount / n;
  // If total is 10.00 and n is 3, it would create 3.33 for each participant (Sum = 9.99), losing 0.01 INR.
  ```
- **How Caught**: Code review of the share calculator in the persistence layer.
- **Correction**: Implemented a running sum validation that assigns the rounding remainder to the final participant:
  ```typescript
  const finalShare = isLast ? totalAmountInr - sum : share;
  ```
  This ensures the split sum matches the total expense amount down to the penny.
