/**
 * Router for the unified Alarm Management API
 * Handles path parsing, route matching, and parameter extraction
 */

import type { HttpMethod, RouteParams, RouteDefinition, RouteHandler, FunctionContext } from './types.js';

// Handler imports
import { getDisciplines } from './handlers/disciplines.js';
import {
  getAlarmFlows,
  getAlarmPattern,
  createAlarmPattern,
  updateAlarmPattern,
  deleteAlarmPattern,
} from './handlers/alarm-patterns.js';
import { getAlarmVersions, rollbackAlarm } from './handlers/alarm-versions.js';
import { getClasses, updateClass } from './handlers/classes.js';
import { importConfig } from './handlers/import.js';

/**
 * Route definitions
 * Order matters - more specific routes should come first
 */
const routes: RouteDefinition[] = [
  // Disciplines
  { method: 'GET', pattern: '/disciplines', handler: 'getDisciplines', paramNames: [] },

  // Alarm Flows
  { method: 'GET', pattern: '/alarm-flows', handler: 'getAlarmFlows', paramNames: [] },

  // Alarm Pattern Versions (must come before /alarm-patterns/:key)
  { method: 'GET', pattern: '/alarm-patterns/:key/versions', handler: 'getAlarmVersions', paramNames: ['key'] },
  { method: 'POST', pattern: '/alarm-patterns/:key/rollback', handler: 'rollbackAlarm', paramNames: ['key'] },

  // Alarm Patterns CRUD
  { method: 'GET', pattern: '/alarm-patterns/:key', handler: 'getAlarmPattern', paramNames: ['key'] },
  { method: 'POST', pattern: '/alarm-patterns', handler: 'createAlarmPattern', paramNames: [] },
  { method: 'PUT', pattern: '/alarm-patterns/:key', handler: 'updateAlarmPattern', paramNames: ['key'] },
  { method: 'DELETE', pattern: '/alarm-patterns/:key', handler: 'deleteAlarmPattern', paramNames: ['key'] },

  // Classes
  { method: 'GET', pattern: '/classes', handler: 'getClasses', paramNames: [] },
  { method: 'PUT', pattern: '/classes/:id', handler: 'updateClass', paramNames: ['id'] },

  // Import
  { method: 'POST', pattern: '/import', handler: 'importConfig', paramNames: [] },
];

/**
 * Handler registry
 */
const handlers: Record<string, RouteHandler> = {
  getDisciplines,
  getAlarmFlows,
  getAlarmPattern,
  createAlarmPattern,
  updateAlarmPattern,
  deleteAlarmPattern,
  getAlarmVersions,
  rollbackAlarm,
  getClasses,
  updateClass,
  importConfig,
};

/**
 * Normalize path by removing trailing slashes and ensuring leading slash
 */
function normalizePath(path: string): string {
  let normalized = path.trim();

  // Ensure leading slash
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  // Remove trailing slash (except for root)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Match a path against a route pattern
 * Returns extracted parameters if matched, null otherwise
 */
function matchRoute(
  path: string,
  pattern: string,
  paramNames: string[]
): RouteParams | null {
  const pathParts = path.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);

  // Must have same number of parts
  if (pathParts.length !== patternParts.length) {
    return null;
  }

  const params: RouteParams = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith(':')) {
      // This is a parameter
      const paramName = patternPart.slice(1);
      params[paramName] = decodeURIComponent(pathPart);
    } else if (patternPart !== pathPart) {
      // Static parts must match exactly
      return null;
    }
  }

  return params;
}

/**
 * Find matching route and extract parameters
 */
export function findRoute(
  path: string,
  method: string
): { route: RouteDefinition; params: RouteParams } | null {
  const normalizedPath = normalizePath(path);
  const normalizedMethod = method.toUpperCase() as HttpMethod;

  for (const route of routes) {
    if (route.method !== normalizedMethod) {
      continue;
    }

    const params = matchRoute(normalizedPath, route.pattern, route.paramNames);
    if (params !== null) {
      return { route, params };
    }
  }

  return null;
}

/**
 * Get handler function by name
 */
export function getHandler(handlerName: string): RouteHandler | null {
  return handlers[handlerName] || null;
}

/**
 * Route and execute request
 */
export async function routeRequest(context: FunctionContext): Promise<unknown> {
  const { req, res, log, error: logError } = context;

  // Find matching route
  const match = findRoute(req.path, req.method);

  if (!match) {
    return res.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route not found: ${req.method} ${req.path}`,
        },
      },
      404
    );
  }

  const { route, params } = match;
  log(`Matched route: ${route.method} ${route.pattern} -> ${route.handler}`);

  // Get handler
  const handler = getHandler(route.handler);
  if (!handler) {
    logError(`Handler not found: ${route.handler}`);
    return res.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Handler not configured',
        },
      },
      500
    );
  }

  // Execute handler - response is returned via res.json/send/empty
  return await handler(context, params, req.query || {});
}

/**
 * Get all available routes (for documentation/debugging)
 */
export function getAvailableRoutes(): Array<{ method: string; path: string }> {
  return routes.map(r => ({ method: r.method, path: r.pattern }));
}
