/**
 * Types for fn-chat-api
 */

/**
 * HTTP Methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';

/**
 * Route parameters extracted from URL path
 */
export type RouteParams = Record<string, string>;

/**
 * Route definition
 */
export interface RouteDefinition {
  method: HttpMethod;
  pattern: string;
  handler: string;
  paramNames: string[];
}

/**
 * Route handler function signature
 */
export type RouteHandler = (
  context: FunctionContext,
  params: RouteParams,
  query: Record<string, string>
) => Promise<unknown>;

/**
 * Appwrite Function Context
 */
export interface FunctionContext {
  req: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
    bodyRaw: string;
    query: Record<string, string>;
  };
  res: {
    send: (body: string, status?: number, headers?: Record<string, string>) => unknown;
    json: (body: unknown, status?: number, headers?: Record<string, string>) => unknown;
    empty: () => unknown;
  };
  log: (message: string) => void;
  error: (message: string) => void;
}

/**
 * User context extracted from headers
 */
export interface UserContext {
  userId: string | null;
  appwriteUserId: string | null;
}

/**
 * Extract user context from request headers
 */
export function getUserContext(req: FunctionContext['req']): UserContext {
  return {
    userId: req.headers['x-user-id'] || req.headers['x-appwrite-user-id'] || null,
    appwriteUserId: req.headers['x-appwrite-user-id'] || null,
  };
}

/**
 * Get authenticated user ID or throw
 */
export function getAuthenticatedUserId(req: FunctionContext['req']): string {
  const context = getUserContext(req);
  const userId = context.userId || context.appwriteUserId;

  if (!userId) {
    throw new Error('Authentication required');
  }

  return userId;
}
