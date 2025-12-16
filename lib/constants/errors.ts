/**
 * Error Constants
 * Error codes and messages for the IoT refrigeration system
 */

/**
 * Error codes for the application
 */
export const ERROR_CODES = {
  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Authentication/Authorization errors (401/403)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  CHAT_NOT_FOUND: 'CHAT_NOT_FOUND',
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',

  // Guardrail errors (400)
  GUARDRAIL_REJECTED: 'GUARDRAIL_REJECTED',
  NOT_REFRIGERATION_RELATED: 'NOT_REFRIGERATION_RELATED',

  // CSV errors (400)
  CSV_VALIDATION_ERROR: 'CSV_VALIDATION_ERROR',
  INVALID_CSV_FORMAT: 'INVALID_CSV_FORMAT',
  EMPTY_CSV_FILE: 'EMPTY_CSV_FILE',
  MISSING_CSV_HEADERS: 'MISSING_CSV_HEADERS',
  NOT_REFRIGERATION_DATA: 'NOT_REFRIGERATION_DATA',
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  ENCODING_ERROR: 'ENCODING_ERROR',

  // Processing errors (500)
  PROCESSING_ERROR: 'PROCESSING_ERROR',
  JOB_PROCESSING_ERROR: 'JOB_PROCESSING_ERROR',
  CSV_PROCESSING_ERROR: 'CSV_PROCESSING_ERROR',
  ANALYSIS_ERROR: 'ANALYSIS_ERROR',
  GRAPH_GENERATION_ERROR: 'GRAPH_GENERATION_ERROR',

  // External service errors (502)
  OPENAI_ERROR: 'OPENAI_ERROR',
  OPENAI_RATE_LIMIT: 'OPENAI_RATE_LIMIT',
  OPENAI_TIMEOUT: 'OPENAI_TIMEOUT',

  // Database errors (500)
  DATABASE_ERROR: 'DATABASE_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',

  // Internal errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

/**
 * Error messages mapped to error codes
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // Validation errors
  [ERROR_CODES.VALIDATION_ERROR]: 'Validation failed',
  [ERROR_CODES.INVALID_INPUT]: 'Invalid input provided',
  [ERROR_CODES.MISSING_REQUIRED_FIELD]: 'Required field is missing',

  // Authentication/Authorization errors
  [ERROR_CODES.UNAUTHORIZED]: 'Authentication required',
  [ERROR_CODES.FORBIDDEN]: 'Access denied',
  [ERROR_CODES.INVALID_TOKEN]: 'Invalid or expired token',

  // Not found errors
  [ERROR_CODES.NOT_FOUND]: 'Resource not found',
  [ERROR_CODES.CHAT_NOT_FOUND]: 'Chat not found',
  [ERROR_CODES.MESSAGE_NOT_FOUND]: 'Message not found',
  [ERROR_CODES.JOB_NOT_FOUND]: 'Job not found',
  [ERROR_CODES.FILE_NOT_FOUND]: 'File not found',

  // Guardrail errors
  [ERROR_CODES.GUARDRAIL_REJECTED]: 'Question rejected by content filter',
  [ERROR_CODES.NOT_REFRIGERATION_RELATED]: 'Question does not appear to be related to refrigeration systems',

  // CSV errors
  [ERROR_CODES.CSV_VALIDATION_ERROR]: 'CSV validation failed',
  [ERROR_CODES.INVALID_CSV_FORMAT]: 'Invalid CSV format',
  [ERROR_CODES.EMPTY_CSV_FILE]: 'CSV file is empty',
  [ERROR_CODES.MISSING_CSV_HEADERS]: 'CSV file is missing headers',
  [ERROR_CODES.NOT_REFRIGERATION_DATA]: 'CSV does not contain refrigeration telemetry data',
  [ERROR_CODES.INVALID_TIMESTAMP]: 'CSV timestamp column is invalid',
  [ERROR_CODES.FILE_TOO_LARGE]: 'File exceeds maximum size limit (50MB)',
  [ERROR_CODES.ENCODING_ERROR]: 'File encoding error',

  // Processing errors
  [ERROR_CODES.PROCESSING_ERROR]: 'An error occurred during processing',
  [ERROR_CODES.JOB_PROCESSING_ERROR]: 'Job processing failed',
  [ERROR_CODES.CSV_PROCESSING_ERROR]: 'CSV processing failed',
  [ERROR_CODES.ANALYSIS_ERROR]: 'Analysis failed',
  [ERROR_CODES.GRAPH_GENERATION_ERROR]: 'Graph generation failed',

  // External service errors
  [ERROR_CODES.OPENAI_ERROR]: 'AI service error',
  [ERROR_CODES.OPENAI_RATE_LIMIT]: 'AI service rate limit exceeded',
  [ERROR_CODES.OPENAI_TIMEOUT]: 'AI service timeout',

  // Database errors
  [ERROR_CODES.DATABASE_ERROR]: 'Database operation failed',
  [ERROR_CODES.STORAGE_ERROR]: 'Storage operation failed',

  // Internal errors
  [ERROR_CODES.INTERNAL_ERROR]: 'An internal error occurred',
  [ERROR_CODES.UNKNOWN_ERROR]: 'An unknown error occurred',
};

/**
 * HTTP status codes mapped to error codes
 */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  // Validation errors (400)
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.INVALID_INPUT]: 400,
  [ERROR_CODES.MISSING_REQUIRED_FIELD]: 400,

  // Authentication/Authorization errors
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.INVALID_TOKEN]: 401,

  // Not found errors (404)
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.CHAT_NOT_FOUND]: 404,
  [ERROR_CODES.MESSAGE_NOT_FOUND]: 404,
  [ERROR_CODES.JOB_NOT_FOUND]: 404,
  [ERROR_CODES.FILE_NOT_FOUND]: 404,

  // Guardrail errors (400)
  [ERROR_CODES.GUARDRAIL_REJECTED]: 400,
  [ERROR_CODES.NOT_REFRIGERATION_RELATED]: 400,

  // CSV errors (400)
  [ERROR_CODES.CSV_VALIDATION_ERROR]: 400,
  [ERROR_CODES.INVALID_CSV_FORMAT]: 400,
  [ERROR_CODES.EMPTY_CSV_FILE]: 400,
  [ERROR_CODES.MISSING_CSV_HEADERS]: 400,
  [ERROR_CODES.NOT_REFRIGERATION_DATA]: 400,
  [ERROR_CODES.INVALID_TIMESTAMP]: 400,
  [ERROR_CODES.FILE_TOO_LARGE]: 413,
  [ERROR_CODES.ENCODING_ERROR]: 400,

  // Processing errors (500)
  [ERROR_CODES.PROCESSING_ERROR]: 500,
  [ERROR_CODES.JOB_PROCESSING_ERROR]: 500,
  [ERROR_CODES.CSV_PROCESSING_ERROR]: 500,
  [ERROR_CODES.ANALYSIS_ERROR]: 500,
  [ERROR_CODES.GRAPH_GENERATION_ERROR]: 500,

  // External service errors (502)
  [ERROR_CODES.OPENAI_ERROR]: 502,
  [ERROR_CODES.OPENAI_RATE_LIMIT]: 429,
  [ERROR_CODES.OPENAI_TIMEOUT]: 504,

  // Database errors (500)
  [ERROR_CODES.DATABASE_ERROR]: 500,
  [ERROR_CODES.STORAGE_ERROR]: 500,

  // Internal errors (500)
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.UNKNOWN_ERROR]: 500,
};

/**
 * Get error message for a given error code
 */
export function getErrorMessage(code: ErrorCode): string {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR];
}

/**
 * Get HTTP status for a given error code
 */
export function getErrorHttpStatus(code: ErrorCode): number {
  return ERROR_HTTP_STATUS[code] || 500;
}
