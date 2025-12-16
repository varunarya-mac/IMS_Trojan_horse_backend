/**
 * Types for fn-job-worker
 */

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
 * Job processing result
 */
export interface JobProcessingResult {
  jobId: string;
  success: boolean;
  error?: string;
  processingTime: number;
}

/**
 * Worker execution result
 */
export interface WorkerExecutionResult {
  processedJobs: number;
  successfulJobs: number;
  failedJobs: number;
  jobs: JobProcessingResult[];
  executionTime: number;
}

/**
 * Function invocation result
 */
export interface FunctionInvocationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
