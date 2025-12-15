/**
 * Logger interface for services and repositories
 * Compatible with Appwrite FunctionContext logging
 */
export interface Logger {
  /**
   * Log an informational message
   */
  log: (message: string) => void;

  /**
   * Log an error message
   */
  error: (message: string) => void;
}

/**
 * Create a logger from Appwrite FunctionContext
 */
export function createLogger(context: {
  log: (message: string) => void;
  error: (message: string) => void;
}): Logger {
  return {
    log: context.log,
    error: context.error,
  };
}

/**
 * Create a no-op logger for backward compatibility
 * Used when logger is optional and not provided
 */
export function createNoOpLogger(): Logger {
  return {
    log: () => {},
    error: () => {},
  };
}
