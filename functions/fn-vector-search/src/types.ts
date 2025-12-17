/**
 * Vector Search Function Types
 */

/**
 * Appwrite function context
 */
export interface FunctionContext {
  req: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
    bodyRaw: string;
  };
  res: {
    send: (body: string, statusCode?: number, headers?: Record<string, string>) => unknown;
    json: (body: unknown, statusCode?: number, headers?: Record<string, string>) => unknown;
  };
  log: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Vector search request actions
 */
export type VectorSearchAction = 'search' | 'health' | 'get_summary';

/**
 * Vector search request body
 */
export interface VectorSearchRequest {
  action: VectorSearchAction;

  // For 'search' action
  query?: string;
  topK?: number;
  minScore?: number;
}

/**
 * Vector search response
 */
export interface VectorSearchResponse {
  success: boolean;
  action: VectorSearchAction;
  data?: VectorSearchResultData | VectorSearchHealthData | VectorSearchSummaryData;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Summary retrieval data
 */
export interface VectorSearchSummaryData {
  summary: string | null;
  found: boolean;
}

/**
 * Search result data
 */
export interface VectorSearchResultData {
  results: SearchResult[];
  query: string;
  totalMatches: number;
  searchTimeMs: number;
}

/**
 * Individual search result
 */
export interface SearchResult {
  content: string;
  score: number;
  metadata: {
    documentId: string;
    documentName: string;
    section?: string;
    chunkIndex: number;
  };
}

/**
 * Health check data
 */
export interface VectorSearchHealthData {
  healthy: boolean;
  chromadbConnected: boolean;
  embeddingsAvailable: boolean;
  collectionName?: string;
  documentCount?: number;
  error?: string;
}

/**
 * ChromaDB Cloud configuration
 */
export interface ChromaDBConfig {
  apiKey: string;
  tenant: string;
  database: string;
}

/**
 * OpenAI configuration for embeddings
 */
export interface EmbeddingConfig {
  apiKey: string;
  model: string;
}
