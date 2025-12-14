/**
 * Types for the unified Alarm Management API
 */

/**
 * Appwrite Function Context
 */
export interface FunctionContext {
  req: {
    body: string;
    bodyRaw: string;
    headers: Record<string, string>;
    method: string;
    path: string;
    query: Record<string, string>;
    queryString: string;
    host: string;
    port: number;
    scheme: string;
    url: string;
  };
  res: {
    json: (data: unknown, statusCode?: number) => void;
    send: (data: string, statusCode?: number, headers?: Record<string, string>) => void;
    empty: () => void;
    redirect: (url: string, statusCode?: number) => void;
  };
  log: (message: string) => void;
  error: (message: string) => void;
}

/**
 * HTTP Methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Route parameters extracted from path
 */
export interface RouteParams {
  [key: string]: string;
}

/**
 * Parsed route information
 */
export interface ParsedRoute {
  path: string;
  method: HttpMethod;
  params: RouteParams;
  query: Record<string, string>;
}

/**
 * Route definition for matching
 */
export interface RouteDefinition {
  method: HttpMethod;
  pattern: string;
  handler: string;
  paramNames: string[];
}

/**
 * Handler function type
 */
export type RouteHandler = (
  context: FunctionContext,
  params: RouteParams,
  query: Record<string, string>
) => Promise<unknown>;

/**
 * Handler module interface
 */
export interface HandlerModule {
  [key: string]: RouteHandler;
}

/**
 * API Response format
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * User context from headers
 */
export interface UserContext {
  userId: string | null;
}

/**
 * Extract user context from request headers
 */
export function getUserContext(headers: Record<string, string>): UserContext {
  const userId = headers['x-user-id'] || headers['x-appwrite-user-id'] || null;
  return { userId };
}
