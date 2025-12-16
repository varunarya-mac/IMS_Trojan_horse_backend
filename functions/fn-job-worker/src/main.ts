/**
 * Job Worker - Entry Point
 *
 * CRON-triggered Appwrite function for background job processing.
 * Polls pending jobs and orchestrates the analysis pipeline.
 *
 * Pipeline:
 *   1. Validate CSV
 *   2. Parse CSV and extract metadata
 *   3. Run AI analysis
 *   4. Generate graph (if recommended)
 *   5. Update message with results
 */

import type { FunctionContext, WorkerExecutionResult } from './types.js';
import { JobRepository } from '@lib/repositories/job.repository.js';
import { JobOrchestratorService } from './services/job-orchestrator.service.js';

/**
 * Worker configuration
 */
const CONFIG = {
  BATCH_SIZE: parseInt(process.env.JOB_WORKER_BATCH_SIZE || '10', 10),
  MAX_STALE_AGE_MINUTES: parseInt(process.env.JOB_MAX_STALE_AGE || '30', 10),
};

/**
 * Main function handler
 */
export default async function (context: FunctionContext): Promise<unknown> {
  const { req, res, log, error: logError } = context;
  const startTime = Date.now();

  log(`Job Worker started - ${new Date().toISOString()}`);

  // Handle OPTIONS for CORS (though this is mainly a CRON function)
  if (req.method === 'OPTIONS') {
    return res.send('', 204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
  }

  const logger = { log, error: logError };
  const result: WorkerExecutionResult = {
    processedJobs: 0,
    successfulJobs: 0,
    failedJobs: 0,
    jobs: [],
    executionTime: 0,
  };

  try {
    const jobRepository = new JobRepository(logger);
    const orchestrator = new JobOrchestratorService(logger);

    // Reset stale jobs first
    const staleJobs = await jobRepository.findStaleProcessingJobs(CONFIG.MAX_STALE_AGE_MINUTES);
    if (staleJobs.length > 0) {
      log(`Found ${staleJobs.length} stale jobs, resetting...`);
      for (const job of staleJobs) {
        await jobRepository.markFailed(job.$id, 'Job timed out during processing');
      }
    }

    // Fetch pending jobs
    const pendingJobs = await jobRepository.findPendingJobs(CONFIG.BATCH_SIZE);
    log(`Found ${pendingJobs.length} pending jobs`);

    if (pendingJobs.length === 0) {
      result.executionTime = Date.now() - startTime;
      return res.json({
        success: true,
        message: 'No pending jobs to process',
        ...result,
      });
    }

    // Process jobs
    const jobResults = await orchestrator.processJobs(pendingJobs);

    // Compile results
    result.processedJobs = jobResults.length;
    result.successfulJobs = jobResults.filter(r => r.success).length;
    result.failedJobs = jobResults.filter(r => !r.success).length;
    result.jobs = jobResults;
    result.executionTime = Date.now() - startTime;

    log(`Job Worker completed: ${result.successfulJobs}/${result.processedJobs} jobs successful in ${result.executionTime}ms`);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`Job Worker error: ${errorMessage}`);

    result.executionTime = Date.now() - startTime;

    return res.json(
      {
        success: false,
        error: {
          code: 'WORKER_ERROR',
          message: errorMessage,
        },
        ...result,
      },
      500
    );
  }
}
