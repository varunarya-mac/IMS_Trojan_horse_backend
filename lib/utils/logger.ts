/**
 * Logger Utility for Appwrite Functions
 *
 * In Appwrite cloud functions, console.log/error statements are automatically
 * captured and displayed in the function execution logs. This utility provides
 * a consistent logging interface throughout the application.
 */

/**
 * Log an informational message
 * These appear in Appwrite function logs
 */
export function log(message: string, ...args: unknown[]): void {
  console.log(`[INFO] ${message}`, ...args);
}

/**
 * Log an error message
 * These appear in Appwrite function logs
 */
export function logError(message: string, ...args: unknown[]): void {
  console.error(`[ERROR] ${message}`, ...args);
}

/**
 * Log a warning message
 * These appear in Appwrite function logs
 */
export function logWarn(message: string, ...args: unknown[]): void {
  console.warn(`[WARN] ${message}`, ...args);
}

/**
 * Log a debug message
 * These appear in Appwrite function logs
 */
export function logDebug(message: string, ...args: unknown[]): void {
  console.debug(`[DEBUG] ${message}`, ...args);
}
