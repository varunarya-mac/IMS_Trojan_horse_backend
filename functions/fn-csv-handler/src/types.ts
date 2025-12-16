/**
 * Types for fn-csv-handler
 */

/**
 * Function request payload
 */
export interface CSVHandlerRequest {
  action: 'validate' | 'process' | 'extract_for_graph';
  fileId: string;
  options?: CSVHandlerOptions;
}

/**
 * Handler options
 */
export interface CSVHandlerOptions {
  // For validation
  checkColumns?: boolean;

  // For processing
  calculateStatistics?: boolean;
  detectAnomalies?: boolean;
  sampleSize?: number; // Max rows to process (for large files)

  // For graph extraction
  columns?: string[];
  timeRange?: {
    start: string;
    end: string;
  };
  aggregation?: 'none' | 'hourly' | 'daily';
  maxDataPoints?: number;
}

/**
 * Function response payload
 */
export interface CSVHandlerResponse {
  success: boolean;
  action: string;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

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
 * Parsed CSV row type
 */
export type CSVRow = Record<string, string>;

/**
 * Column info after detection
 */
export interface ColumnInfo {
  name: string;
  type: 'numeric' | 'string' | 'datetime' | 'boolean' | 'unknown';
  sampleValues: string[];
  nullCount: number;
  uniqueCount: number;
}
