/**
 * Chat API - Unified Entry Point
 *
 * This is an Appwrite function that handles all chat-related endpoints
 * for the IoT Refrigeration AI Chat feature.
 *
 * Routes:
 *   GET    /chats                    - List user's chats
 *   POST   /chats                    - Create new chat
 *   GET    /chats/:chatId            - Get chat with details
 *   DELETE /chats/:chatId            - Delete chat and resources
 *   POST   /chats/:chatId/messages   - Send message (with optional CSV)
 *   GET    /chats/:chatId/messages   - List messages in chat
 *   GET    /jobs/:jobId              - Get job status
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
        name: 'IoT Refrigeration Chat API',
        version: '1.0.0',
        description: 'AI-powered chat API for refrigeration data analysis',
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
