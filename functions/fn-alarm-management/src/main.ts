/**
 * Alarm Management API - Unified Entry Point
 *
 * This is a unified Appwrite function that consolidates all alarm management
 * endpoints into a single function with RESTful path-based routing.
 *
 * Routes:
 *   GET    /disciplines                     - List all disciplines with types
 *   GET    /alarm-flows                     - Get alarm flows by discipline name ID
 *   GET    /alarm-patterns/:key             - Get single alarm pattern
 *   POST   /alarm-patterns                  - Create new alarm pattern
 *   PUT    /alarm-patterns/:key             - Update alarm pattern
 *   DELETE /alarm-patterns/:key             - Delete alarm pattern
 *   GET    /alarm-patterns/:key/versions    - Get version history
 *   POST   /alarm-patterns/:key/rollback    - Rollback to version
 *   GET    /classes                         - Get classes by discipline type
 *   PUT    /classes/:id                     - Update class configuration
 *   POST   /import                          - Import configuration JSON
 */

import type { FunctionContext } from './types.js';
import { routeRequest, getAvailableRoutes } from './router.js';
import { sendError } from './utils/response.js';

/**
 * Main function handler
 */
export default async function (context: FunctionContext): Promise<unknown> {
  const { req, res, log, error: logError } = context;

  // Log incoming request
  log(`${req.method} ${req.path}`);

  // Handle OPTIONS for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.send('', 204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-id, x-appwrite-user-id',
    });
  }

  // Handle root path - return API info
  if (req.path === '/' || req.path === '') {
    return res.json({
      success: true,
      data: {
        name: 'Alarm Management API',
        version: '1.0.0',
        routes: getAvailableRoutes(),
      },
    });
  }

  try {
    // Route the request to appropriate handler
   return await routeRequest(context);
  } catch (error) {
    // Catch any unhandled errors
    logError(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
    return sendError(res, 'INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
}
