/**
 * Job Worker - Cleanup Worker
 *
 * CRON-triggered Appwrite function for maintenance and cleanup tasks.
 * Runs periodically to clean up expired data and maintain system health.
 *
 * Tasks:
 *   1. Clean up expired chat context
 *   2. Remove orphan files from storage
 *   3. Archive old inactive chats
 */

import type { FunctionContext, WorkerExecutionResult, TaskResult } from './types.js';
import { cleanupExpiredContext } from './tasks/cleanup-context.js';
import { cleanupOrphanFiles } from './tasks/cleanup-files.js';
import { archiveOldChats } from './tasks/archive-chats.js';

/**
 * Main function handler
 */
export default async function (context: FunctionContext): Promise<unknown> {
  const { req, res, log, error: logError } = context;
  const startTime = Date.now();

  log(`Cleanup Worker started - ${new Date().toISOString()}`);

  // Handle OPTIONS for CORS (though this is mainly a CRON function)
  if (req.method === 'OPTIONS') {
    return res.send('', 204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
  }

  const logger = { log, error: logError };
  const tasks: TaskResult[] = [];
  let overallSuccess = true;

  // Task 1: Clean up expired context
  try {
    const taskStart = Date.now();
    log('Running: Clean up expired context');
    const contextResult = await cleanupExpiredContext(logger);

    tasks.push({
      taskName: 'cleanup-context',
      success: contextResult.errors.length === 0,
      duration: Date.now() - taskStart,
      details: {
        deletedCount: contextResult.deletedCount,
      },
      errors: contextResult.errors.length > 0 ? contextResult.errors : undefined,
    });

    if (contextResult.errors.length > 0) {
      overallSuccess = false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`Context cleanup task failed: ${errorMessage}`);
    tasks.push({
      taskName: 'cleanup-context',
      success: false,
      duration: 0,
      details: {},
      errors: [errorMessage],
    });
    overallSuccess = false;
  }

  // Task 2: Clean up orphan files
  try {
    const taskStart = Date.now();
    log('Running: Clean up orphan files');
    const filesResult = await cleanupOrphanFiles(logger);

    tasks.push({
      taskName: 'cleanup-files',
      success: filesResult.errors.length === 0,
      duration: Date.now() - taskStart,
      details: {
        scannedCount: filesResult.scannedCount,
        deletedCount: filesResult.deletedCount,
      },
      errors: filesResult.errors.length > 0 ? filesResult.errors : undefined,
    });

    if (filesResult.errors.length > 0) {
      overallSuccess = false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`File cleanup task failed: ${errorMessage}`);
    tasks.push({
      taskName: 'cleanup-files',
      success: false,
      duration: 0,
      details: {},
      errors: [errorMessage],
    });
    overallSuccess = false;
  }

  // Task 3: Archive old chats
  try {
    const taskStart = Date.now();
    log('Running: Archive old chats');
    const archiveResult = await archiveOldChats(logger);

    tasks.push({
      taskName: 'archive-chats',
      success: archiveResult.errors.length === 0,
      duration: Date.now() - taskStart,
      details: {
        archivedCount: archiveResult.archivedCount,
        deletedMessages: archiveResult.deletedMessages,
        deletedFiles: archiveResult.deletedFiles,
      },
      errors: archiveResult.errors.length > 0 ? archiveResult.errors : undefined,
    });

    if (archiveResult.errors.length > 0) {
      overallSuccess = false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`Chat archive task failed: ${errorMessage}`);
    tasks.push({
      taskName: 'archive-chats',
      success: false,
      duration: 0,
      details: {},
      errors: [errorMessage],
    });
    overallSuccess = false;
  }

  const totalDuration = Date.now() - startTime;
  const result: WorkerExecutionResult = {
    success: overallSuccess,
    tasks,
    totalDuration,
    timestamp: new Date().toISOString(),
  };

  const successfulTasks = tasks.filter(t => t.success).length;
  log(`Cleanup Worker completed: ${successfulTasks}/${tasks.length} tasks successful in ${totalDuration}ms`);

  return res.json(result, overallSuccess ? 200 : 500);
}
