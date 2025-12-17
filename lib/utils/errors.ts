/**
 * Custom Error Classes
 * Production-grade error handling for the API
 */

/**
 * Base API error class
 */
export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends ApiError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Conflict error (409) - e.g., duplicate resource
 */
export class ConflictError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * Internal server error (500)
 */
export class InternalError extends ApiError {
  constructor(message: string = 'Internal server error', details?: unknown) {
    super(message, 'INTERNAL_ERROR', 500, details);
    this.name = 'InternalError';
  }
}

/**
 * Database error
 */
export class DatabaseError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

/**
 * Version conflict error - for optimistic locking
 */
export class VersionConflictError extends ApiError {
  constructor(alarmPatternKey: string, expectedVersion: number, actualVersion: number) {
    super(
      `Version conflict for alarm pattern '${alarmPatternKey}': expected version ${expectedVersion}, but found version ${actualVersion}`,
      'VERSION_CONFLICT',
      409,
      { alarmPatternKey, expectedVersion, actualVersion }
    );
    this.name = 'VersionConflictError';
  }
}

/**
 * Import error
 */
export class ImportError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(message, 'IMPORT_ERROR', 400, details);
    this.name = 'ImportError';
  }
}

/**
 * Guardrail error - for content filtering rejections
 */
export interface GuardrailErrorDetails {
  suggestion?: string;
  matchedKeywords?: string[];
  detectedColumns?: string[];
}

export class GuardrailError extends ApiError {
  public readonly suggestion?: string;
  public readonly details?: GuardrailErrorDetails;

  constructor(message: string, details?: GuardrailErrorDetails) {
    super(message, 'GUARDRAIL_REJECTED', 400, details);
    this.name = 'GuardrailError';
    this.suggestion = details?.suggestion;
    this.details = details;
  }
}

/**
 * CSV validation error
 */
export class CSVValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(message, 'CSV_VALIDATION_ERROR', 400, details);
    this.name = 'CSVValidationError';
  }
}

/**
 * Job processing error
 */
export class JobProcessingError extends ApiError {
  public readonly retryable: boolean;

  constructor(message: string, retryable: boolean = false, details?: unknown) {
    super(message, 'JOB_PROCESSING_ERROR', 500, { ...details as object, retryable });
    this.name = 'JobProcessingError';
    this.retryable = retryable;
  }
}

/**
 * OpenAI service error
 */
export class OpenAIError extends ApiError {
  public readonly retryable: boolean;

  constructor(message: string, retryable: boolean = true, details?: unknown) {
    super(message, 'OPENAI_ERROR', 502, { ...details as object, retryable });
    this.name = 'OpenAIError';
    this.retryable = retryable;
  }
}

/**
 * Storage error
 */
export class StorageError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(message, 'STORAGE_ERROR', 500, details);
    this.name = 'StorageError';
  }
}

/**
 * Error handler utility
 */
export function handleError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for Appwrite errors
    if ('code' in error && 'type' in error) {
      const appwriteError = error as Error & { code: number; type: string };

      if (appwriteError.code === 404) {
        return new NotFoundError('Resource');
      }

      if (appwriteError.code === 409) {
        return new ConflictError(appwriteError.message);
      }

      return new DatabaseError(appwriteError.message, {
        type: appwriteError.type,
        code: appwriteError.code,
      });
    }

    return new InternalError(error.message);
  }

  return new InternalError('An unexpected error occurred');
}

/**
 * Type guard for ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
