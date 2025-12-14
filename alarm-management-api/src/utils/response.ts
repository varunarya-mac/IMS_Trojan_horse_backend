/**
 * Response utility functions for the unified API
 */

import type { FunctionContext, ApiResponse } from '../types.js';
import { ApiError } from '@lib/utils/errors.js';

/**
 * Send a successful JSON response
 */
export function sendSuccess<T>(
  res: FunctionContext['res'],
  data: T,
  statusCode: number = 200
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };
  res.json(response, statusCode);
}

/**
 * Send an error JSON response
 */
export function sendError(
  res: FunctionContext['res'],
  code: string,
  message: string,
  statusCode: number = 500,
  details?: unknown
): void {
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
  res.json(response, statusCode);
}

/**
 * Handle errors and send appropriate response
 */
export function handleError(
  res: FunctionContext['res'],
  error: unknown,
  logError: (msg: string) => void
): void {
  if (error instanceof ApiError) {
    logError(`${error.code}: ${error.message}`);
    sendError(res, error.code, error.message, error.statusCode, error.details);
    return;
  }

  if (error instanceof Error) {
    logError(`Unexpected error: ${error.message}`);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    return;
  }

  logError(`Unknown error: ${String(error)}`);
  sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
}

/**
 * Parse JSON body safely
 */
export function parseBody<T = unknown>(body: string): T | null {
  if (!body || body.trim() === '') {
    return null;
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

/**
 * Get request data from body or query params (for GET requests)
 */
export function getRequestData<T>(
  body: string,
  query: Record<string, string>
): T {
  const parsed = parseBody<T>(body);
  if (parsed) {
    return parsed;
  }
  // For GET requests, use query params
  return query as unknown as T;
}
