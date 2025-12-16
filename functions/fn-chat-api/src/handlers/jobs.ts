/**
 * Jobs Handler
 * Handles job status polling operations
 */

import type { FunctionContext, RouteParams } from '../types.js';
import { getAuthenticatedUserId } from '../types.js';
import { sendSuccess, sendHandledError } from '../utils/response.js';
import { JobService } from '@lib/services/job.service.js';

/**
 * GET /jobs/:jobId
 * Get the status of a processing job
 */
export async function getJobStatus(
  context: FunctionContext,
  params: RouteParams,
  _query: Record<string, string>
): Promise<unknown> {
  const { req, res, log, error: logError } = context;

  try {
    const userId = getAuthenticatedUserId(req);
    const jobId = params.jobId;
    log(`Getting job status: ${jobId} for user: ${userId}`);

    const jobService = new JobService({ log, error: logError });
    const status = await jobService.getJobStatusForUser(jobId, userId);

    log(`Job ${jobId} status: ${status.status} (${status.progress}%)`);

    return sendSuccess(res, status);
  } catch (error) {
    return sendHandledError(res, error);
  }
}
