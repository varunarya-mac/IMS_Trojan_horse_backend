/**
 * Job Service
 * Business logic for processing job management
 */

import { JobRepository } from '../repositories/job.repository.js';
import { MessageRepository } from '../repositories/message.repository.js';
import { ChatRepository } from '../repositories/chat.repository.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import type {
  ProcessingJobEntity,
  JobType,
  JobStatus,
  JobStage,
  GetJobStatusResponse,
  CreateJobRequest,
} from '../types/job.types.js';
import type { Logger } from '../types/logger.js';
import { createNoOpLogger } from '../types/logger.js';

/**
 * Job service for managing processing jobs
 */
export class JobService {
  private readonly jobRepository: JobRepository;
  private readonly messageRepository: MessageRepository;
  private readonly chatRepository: ChatRepository;
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || createNoOpLogger();
    this.jobRepository = new JobRepository(this.logger);
    this.messageRepository = new MessageRepository(this.logger);
    this.chatRepository = new ChatRepository(this.logger);
  }

  /**
   * Create a new processing job
   */
  async createJob(request: CreateJobRequest): Promise<ProcessingJobEntity> {
    return this.jobRepository.createJob({
      chatId: request.chatId,
      messageId: request.messageId,
      userId: request.userId,
      jobType: request.jobType,
      userQuestion: request.userQuestion,
      csvFileId: request.csvFileId,
      maxRetries: 3,
    });
  }

  /**
   * Get job status for a user
   */
  async getJobStatusForUser(jobId: string, userId: string): Promise<GetJobStatusResponse> {
    const job = await this.jobRepository.findById(jobId);

    if (!job) {
      throw new NotFoundError('Job', jobId);
    }

    if (job.userId !== userId) {
      throw new ForbiddenError('Access denied to this job');
    }

    return this.toJobStatusResponse(job);
  }

  /**
   * Get pending jobs for processing
   */
  async getPendingJobs(limit: number = 10): Promise<ProcessingJobEntity[]> {
    return this.jobRepository.findPendingJobs(limit);
  }

  /**
   * Update job progress
   */
  async updateProgress(jobId: string, stage: JobStage): Promise<void> {
    await this.jobRepository.updateProgress(jobId, stage);
  }

  /**
   * Mark job as completed
   */
  async markCompleted(jobId: string): Promise<void> {
    const job = await this.jobRepository.findByIdOrFail(jobId, 'Job');

    // Mark job as completed
    await this.jobRepository.markCompleted(jobId);

    // Update chat status
    await this.chatRepository.updateStatus(job.chatId, 'completed');
  }

  /**
   * Mark job as failed
   */
  async markFailed(jobId: string, errorMessage: string): Promise<void> {
    const job = await this.jobRepository.findByIdOrFail(jobId, 'Job');

    // Mark job as failed (with retry logic)
    const updatedJob = await this.jobRepository.markFailed(jobId, errorMessage);

    // If job is permanently failed, update chat and message
    if (updatedJob.status === 'failed') {
      await this.chatRepository.updateStatus(job.chatId, 'error');
      await this.messageRepository.updateWithError(
        job.messageId,
        'An error occurred while processing your request. Please try again.'
      );
    }
  }

  /**
   * Check if job can be retried
   */
  async canRetry(jobId: string): Promise<boolean> {
    return this.jobRepository.canRetry(jobId);
  }

  /**
   * Get job statistics
   */
  async getJobStats(): Promise<{ pending: number; processing: number }> {
    const [pending, processing] = await Promise.all([
      this.jobRepository.countPending(),
      this.jobRepository.countProcessing(),
    ]);

    return { pending, processing };
  }

  /**
   * Find and reset stale jobs
   */
  async resetStaleJobs(maxAgeMinutes: number = 30): Promise<number> {
    const staleJobs = await this.jobRepository.findStaleProcessingJobs(maxAgeMinutes);
    let resetCount = 0;

    for (const job of staleJobs) {
      await this.jobRepository.markFailed(job.$id, 'Job timed out');
      resetCount++;
    }

    return resetCount;
  }

  /**
   * Estimate processing time based on file size
   */
  estimateProcessingTime(fileSizeBytes: number | null): number {
    if (!fileSizeBytes) return 30;

    const sizeMB = fileSizeBytes / (1024 * 1024);

    if (sizeMB < 1) return 15;
    if (sizeMB < 5) return 30;
    if (sizeMB < 10) return 45;
    if (sizeMB < 25) return 60;
    return 90;
  }

  /**
   * Convert job entity to status response
   */
  private async toJobStatusResponse(job: ProcessingJobEntity): Promise<GetJobStatusResponse> {
    const response: GetJobStatusResponse = {
      jobId: job.$id,
      chatId: job.chatId,
      messageId: job.messageId,
      status: job.status as JobStatus,
      progress: job.progress,
      progressMessage: job.progressMessage,
      createdAt: job.$createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };

    // Add result info if completed
    if (job.status === 'completed') {
      const message = await this.messageRepository.findById(job.messageId);
      if (message) {
        response.result = {
          messageId: job.messageId,
          hasGraph: !!message.graphImageId,
          graphUrl: message.graphImageId
            ? this.getGraphUrl(message.graphImageId)
            : undefined,
        };
      }
    }

    // Add error info if failed
    if (job.status === 'failed') {
      response.error = {
        code: 'PROCESSING_FAILED',
        message: job.errorMessage || 'An error occurred during processing',
        retryable: job.retryCount < job.maxRetries,
      };
    }

    return response;
  }

  /**
   * Get graph URL from file ID
   */
  private getGraphUrl(graphImageId: string): string {
    const endpoint = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
    const projectId = process.env.APPWRITE_PROJECT_ID || '';
    const bucketId = process.env.REFRIGERATION_BUCKET_ID || 'refrigeration-files';

    return `${endpoint}/storage/buckets/${bucketId}/files/${graphImageId}/view?project=${projectId}`;
  }
}

export default JobService;
