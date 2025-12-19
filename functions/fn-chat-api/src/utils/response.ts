/**
 * Response utilities for fn-chat-api
 */

import type { FunctionContext } from '../types.js';
import { ApiError, handleError } from '@lib/utils/errors.js';

/**
 * Standard API response format
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
    processingTime?: number;
  };
}

/**
 * Send success response
 */
export function sendSuccess<T>(
  res: FunctionContext['res'],
  data: T,
  status: number = 200,
  meta?: ApiResponse['meta']
): unknown {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };

  if (meta) {
    response.meta = meta;
  }

  return res.json(response, status, {
    'Access-Control-Allow-Origin': '*',
  });
}

/**
 * Send error response
 */
export function sendError(
  res: FunctionContext['res'],
  code: string,
  message: string,
  status: number = 500,
  details?: unknown
): unknown {
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };

  return res.json(response, status, {
    'Access-Control-Allow-Origin': '*',
  });
}

/**
 * Handle error and send appropriate response
 */
export function sendHandledError(
  res: FunctionContext['res'],
  error: unknown
): unknown {
  const apiError = handleError(error);

  return sendError(
    res,
    apiError.code,
    apiError.message,
    apiError.statusCode,
    apiError.details
  );
}

/**
 * Parse request body as JSON
 */
export function parseBody<T>(req: FunctionContext['req']): T | null {
  try {
    if (!req.body || req.body === '') {
      return null;
    }
    return JSON.parse(req.body) as T;
  } catch {
    return null;
  }
}

/**
 * Get request data from body or query
 */
export function getRequestData<T>(
  req: FunctionContext['req'],
  key: string
): T | null {
  // First try body
  const body = parseBody<Record<string, unknown>>(req);
  if (body && key in body) {
    return body[key] as T;
  }

  // Then try query params
  if (req.query && key in req.query) {
    return req.query[key] as T;
  }

  return null;
}

/**
 * Require a value from request data or throw
 */
export function requireRequestData<T>(
  req: FunctionContext['req'],
  key: string,
  errorMessage?: string
): T {
  const value = getRequestData<T>(req, key);

  if (value === null || value === undefined) {
    throw new ApiError(
      errorMessage || `Missing required field: ${key}`,
      'VALIDATION_ERROR',
      400
    );
  }

  return value;
}
