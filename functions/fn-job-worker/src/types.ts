/**
 * Types for fn-job-worker (Cleanup Worker)
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
 * Task execution result
 */
export interface TaskResult {
  taskName: string;
  success: boolean;
  duration: number;
  details: Record<string, unknown>;
  errors?: string[];
}

/**
 * Worker execution result
 */
export interface WorkerExecutionResult {
  success: boolean;
  tasks: TaskResult[];
  totalDuration: number;
  timestamp: string;
}
