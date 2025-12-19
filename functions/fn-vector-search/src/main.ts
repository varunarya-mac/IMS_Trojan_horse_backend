/**
 * Vector Search - Entry Point
 *
 * Appwrite function for RAG vector search using ChromaDB.
 * This function handles semantic search queries against the refrigeration knowledge base.
 *
 * Actions:
 *   search - Search for relevant documents based on query
 *   get_summary - Get pre-computed document summary for fallback
 *   health - Check health status of the service
 */

import type {
  FunctionContext,
  VectorSearchRequest,
  VectorSearchResponse,
} from './types.js';
import { SearchService } from './services/search.service.js';

/**
 * Get environment configuration
 */
function getConfig() {
  return {
    chromadb: {
      apiKey: process.env.CHROMADB_API_KEY || '',
      tenant: process.env.CHROMADB_TENANT || '',
      database: process.env.CHROMADB_DATABASE || 'IMS_Alarm_management',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      embeddingModel: 'text-embedding-3-small',
    },
  };
}

/**
 * Parse request body
 */
function parseRequest(body: string): VectorSearchRequest | null {
  try {
    if (!body || body === '') return null;
    return JSON.parse(body) as VectorSearchRequest;
  } catch {
    return null;
  }
}

/**
 * Send response
 */
function sendResponse(
  res: FunctionContext['res'],
  response: VectorSearchResponse,
  status: number = 200
): unknown {
  return res.json(response, status, {
    'Access-Control-Allow-Origin': '*',
  });
}

/**
 * Send error response
 */
function sendError(
  res: FunctionContext['res'],
  code: string,
  message: string,
  status: number = 500,
  details?: unknown
): unknown {
  return sendResponse(
    res,
    {
      success: false,
      action: 'search',
      error: { code, message, details },
    },
    status
  );
}

/**
 * Handle search action
 */
async function handleSearch(
  context: FunctionContext,
  request: VectorSearchRequest
): Promise<VectorSearchResponse> {
  const { log } = context;

  if (!request.query) {
    return {
      success: false,
      action: 'search',
      error: {
        code: 'MISSING_QUERY',
        message: 'Query is required for search action',
      },
    };
  }

  log(`Searching for: "${request.query.substring(0, 100)}..."`);

  const config = getConfig();
  const searchService = new SearchService(config);

  const results = await searchService.search(
    request.query,
    request.topK || 5,
    request.minScore || 0.5
  );

  log(`Found ${results.totalMatches} results in ${results.searchTimeMs}ms`);

  return {
    success: true,
    action: 'search',
    data: results,
  };
}

/**
 * Handle health action
 */
async function handleHealth(
  context: FunctionContext
): Promise<VectorSearchResponse> {
  const { log } = context;

  log('Checking health status...');

  const config = getConfig();
  const searchService = new SearchService(config);

  const health = await searchService.getHealth();

  log(`Health check: ${health.healthy ? 'OK' : 'FAILED'}`);

  return {
    success: health.healthy,
    action: 'health',
    data: health,
  };
}

/**
 * Handle get_summary action
 * Returns the pre-computed document summary for fallback scenarios
 */
async function handleGetSummary(
  context: FunctionContext
): Promise<VectorSearchResponse> {
  const { log } = context;

  log('Getting document summary...');

  const config = getConfig();
  const searchService = new SearchService(config);

  const summary = await searchService.getSummary();

  log(`Summary found: ${summary !== null}`);

  return {
    success: summary !== null,
    action: 'get_summary',
    data: {
      summary,
      found: summary !== null,
    },
  };
}

/**
 * Main function handler
 */
export default async function (context: FunctionContext): Promise<unknown> {
  const { req, res, log, error: logError } = context;

  log(`Vector Search: ${req.method} ${req.path}`);

  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    return res.send('', 204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Only POST method is allowed', 405);
  }

  // Parse request
  const request = parseRequest(req.body);
  if (!request) {
    return sendError(res, 'INVALID_REQUEST', 'Invalid request body', 400);
  }

  if (!request.action) {
    return sendError(res, 'MISSING_ACTION', 'Action is required', 400);
  }

  try {
    let response: VectorSearchResponse;

    switch (request.action) {
      case 'search':
        response = await handleSearch(context, request);
        break;
      case 'get_summary':
        response = await handleGetSummary(context);
        break;
      case 'health':
        response = await handleHealth(context);
        break;
      default:
        return sendError(res, 'INVALID_ACTION', `Unknown action: ${request.action}`, 400);
    }

    return sendResponse(res, response, response.success ? 200 : 400);
  } catch (error) {
    logError(`Error in Vector Search: ${error instanceof Error ? error.message : String(error)}`);
    return sendError(
      res,
      'PROCESSING_ERROR',
      error instanceof Error ? error.message : 'An error occurred',
      500
    );
  }
}
