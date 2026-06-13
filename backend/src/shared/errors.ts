import { Response } from "express";

export class AppError extends Error {
  public stage: string;
  public statusCode: number;

  constructor(message: string, stage: string, statusCode: number = 400) {
    super(message);
    this.name = this.constructor.name;
    this.stage = stage;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ImportError extends AppError {
  constructor(message: string, stage: string = "CSV_PARSER") {
    super(message, stage, 400);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, stage: string = "VALIDATION") {
    super(message, stage, 400);
  }
}

export class NormalizationError extends AppError {
  constructor(message: string, stage: string = "NORMALIZER") {
    super(message, stage, 400);
  }
}

export class AnomalyError extends AppError {
  constructor(message: string, stage: string = "ANOMALY_ENGINE") {
    super(message, stage, 400);
  }
}

export class PersistenceError extends AppError {
  constructor(message: string, stage: string = "PERSISTENCE") {
    super(message, stage, 500);
  }
}

/**
 * Sends a structured, demystified error payload back to the client.
 */
export function sendStructuredError(res: Response, err: any) {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const stage = err instanceof AppError ? err.stage : "SERVER";
  const message = err.message || "An unexpected error occurred.";

  console.error(`[Error in ${stage}]:`, err);

  return res.status(statusCode).json({
    success: false,
    stage,
    message
  });
}
