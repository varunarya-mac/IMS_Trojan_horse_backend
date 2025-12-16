/**
 * Job Repository
 * Handles database operations for processing job documents
 */

import { Query } from 'node-appwrite';
import { BaseRepository, type QueryOptions, type PaginatedResult } from './base.repository.js';
import { COLLECTION_IDS } from '../types/entities.js';
import type { ProcessingJobEntity, JobStatus, JobType, JobStage } from '../types/job.types.js';
import { JOB_PROGRESS_MAP } from '../types/job.types.js';
import type { BaseEntity } from '../types/entities.js';
import type { Logger } from '../types/logger.js';

/**
 * Job repository for managing processing job documents
 */
export class JobRepository extends BaseRepository<ProcessingJobEntity> {
  constructor(logger?: Logger) {
    super(COLLECTION_IDS.PROCESSING_JOBS, logger);
  }

  /**
   * Find pending jobs for processing (ordered by creation time)
   */
  async findPendingJobs(limit: number = 10): Promise<ProcessingJobEntity[]> {
    const result = await this.findAll({
      filters: [Query.equal('status', 'pending')],
      orderBy: '$createdAt',
      orderDirection: 'asc',
      limit,
    });
    return result.documents;
  }

  /**
   * Find jobs by status
   */
  async findByStatus(
    status: JobStatus,
    options: Omit<QueryOptions, 'filters'> = {}
  ): Promise<PaginatedResult<ProcessingJobEntity>> {
    const filters = [Query.equal('status', status)];
    return this.findAll({
      ...options,
      filters,
      orderBy: options.orderBy || '$createdAt',
      orderDirection: options.orderDirection || 'desc',
    });
  }

  /**
   * Find jobs for a specific user
   */
  async findByUserId(
    userId: string,
    options: Omit<QueryOptions, 'filters'> = {}
  ): Promise<PaginatedResult<ProcessingJobEntity>> {
    const filters = [Query.equal('userId', userId)];
    return this.findAll({
      ...options,
      filters,
      orderBy: options.orderBy || '$createdAt',
      orderDirection: options.orderDirection || 'desc',
    });
  }

  /**
   * Find jobs for a specific chat
   */
  async findByChatId(
    chatId: string,
    options: Omit<QueryOptions, 'filters'> = {}
  ): Promise<PaginatedResult<ProcessingJobEntity>> {
    const filters = [Query.equal('chatId', chatId)];
    return this.findAll({
      ...options,
      filters,
      orderBy: options.orderBy || '$createdAt',
      orderDirection: options.orderDirection || 'desc',
    });
  }

  /**
   * Get job for a user (with ownership check)
   */
  async findByIdForUser(jobId: string, userId: string): Promise<ProcessingJobEntity | null> {
    const job = await this.findById(jobId);
    if (job && job.userId === userId) {
      return job;
    }
    return null;
  }

  /**
   * Create a new processing job
   */
  async createJob(data: {
    chatId: string;
    messageId: string;
    userId: string;
    jobType: JobType;
    userQuestion: string;
    csvFileId: string;
    maxRetries?: number;
  }): Promise<ProcessingJobEntity> {
    return this.create({
      chatId: data.chatId,
      messageId: data.messageId,
      userId: data.userId,
      jobType: data.jobType,
      status: 'pending',
      progress: 0,
      progressMessage: JOB_PROGRESS_MAP.queued.message,
      errorMessage: null,
      retryCount: 0,
      maxRetries: data.maxRetries ?? 3,
      startedAt: null,
      completedAt: null,
      userQuestion: data.userQuestion,
      csvFileId: data.csvFileId,
    } as Omit<ProcessingJobEntity, keyof BaseEntity>);
  }

  /**
   * Update job progress
   */
  async updateProgress(jobId: string, stage: JobStage): Promise<ProcessingJobEntity> {
    const progressInfo = JOB_PROGRESS_MAP[stage];

    const updateData: Partial<Omit<ProcessingJobEntity, keyof BaseEntity>> = {
      status: stage === 'completed' ? 'completed' : 'processing',
      progress: progressInfo.progress,
      progressMessage: progressInfo.message,
    };

    // Set startedAt on first processing step
    if (stage === 'validating_csv') {
      updateData.startedAt = new Date().toISOString();
    }

    // Set completedAt when done
    if (stage === 'completed') {
      updateData.completedAt = new Date().toISOString();
    }

    return this.update(jobId, updateData);
  }

  /**
   * Mark job as completed
   */
  async markCompleted(jobId: string): Promise<ProcessingJobEntity> {
    return this.updateProgress(jobId, 'completed');
  }

  /**
   * Mark job as failed
   */
  async markFailed(jobId: string, errorMessage: string): Promise<ProcessingJobEntity> {
    const job = await this.findByIdOrFail(jobId, 'Job');
    const newRetryCount = job.retryCount + 1;
    const shouldRetry = newRetryCount < job.maxRetries;

    return this.update(jobId, {
      status: shouldRetry ? 'pending' : 'failed',
      retryCount: newRetryCount,
      errorMessage,
      progress: 0,
      progressMessage: shouldRetry
        ? `Retry ${newRetryCount}/${job.maxRetries} pending...`
        : 'Job failed after maximum retries',
    } as Partial<Omit<ProcessingJobEntity, keyof BaseEntity>>);
  }

  /**
   * Check if job can be retried
   */
  async canRetry(jobId: string): Promise<boolean> {
    const job = await this.findById(jobId);
    if (!job) return false;
    return job.retryCount < job.maxRetries;
  }

  /**
   * Count pending jobs
   */
  async countPending(): Promise<number> {
    return this.count([Query.equal('status', 'pending')]);
  }

  /**
   * Count processing jobs
   */
  async countProcessing(): Promise<number> {
    return this.count([Query.equal('status', 'processing')]);
  }

  /**
   * Delete all jobs for a chat
   */
  async deleteAllByChatId(chatId: string): Promise<number> {
    const jobs = await this.findByChatId(chatId, { limit: 1000 });
    let deletedCount = 0;

    for (const job of jobs.documents) {
      await this.delete(job.$id);
      deletedCount++;
    }

    return deletedCount;
  }

  /**
   * Find stale processing jobs (stuck for too long)
   */
  async findStaleProcessingJobs(maxAgeMinutes: number = 30): Promise<ProcessingJobEntity[]> {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

    const result = await this.findAll({
      filters: [
        Query.equal('status', 'processing'),
        Query.lessThan('startedAt', cutoffTime),
      ],
      limit: 100,
    });

    return result.documents;
  }
}

export default JobRepository;
