/**
 * Progress Tracker Service
 * Tracks and updates job processing progress
 */

import { JobRepository } from '@lib/repositories/job.repository.js';
import { MessageRepository } from '@lib/repositories/message.repository.js';
import { ChatRepository } from '@lib/repositories/chat.repository.js';
import type { JobStage } from '@lib/types/job.types.js';
import type { Logger } from '@lib/types/logger.js';

/**
 * Progress Tracker Service
 */
export class ProgressTrackerService {
  private readonly jobRepository: JobRepository;
  private readonly messageRepository: MessageRepository;
  private readonly chatRepository: ChatRepository;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.jobRepository = new JobRepository(logger);
    this.messageRepository = new MessageRepository(logger);
    this.chatRepository = new ChatRepository(logger);
  }

  /**
   * Update job progress
   */
  async updateProgress(jobId: string, stage: JobStage): Promise<void> {
    await this.jobRepository.updateProgress(jobId, stage);
    this.logger.log(`Job ${jobId} progress updated: ${stage}`);
  }

  /**
   * Mark job as completed
   */
  async markCompleted(
    jobId: string,
    messageId: string,
    chatId: string,
    result: {
      content: string;
      summaryData: Record<string, unknown>;
      graphImageId?: string;
      processingTime: number;
      tokenUsage: Record<string, number>;
    }
  ): Promise<void> {
    // Update message with results
    await this.messageRepository.updateWithAnalysisResults(messageId, {
      content: result.content,
      contentType: 'analysis',
      summaryData: JSON.stringify(result.summaryData),
      graphImageId: result.graphImageId || null,
      processingTime: result.processingTime,
      tokenUsage: JSON.stringify(result.tokenUsage),
    });

    // Mark job as completed
    await this.jobRepository.markCompleted(jobId);

    // Update chat status
    await this.chatRepository.updateStatus(chatId, 'completed');

    this.logger.log(`Job ${jobId} completed successfully`);
  }

  /**
   * Mark job as failed
   */
  async markFailed(
    jobId: string,
    messageId: string,
    chatId: string,
    errorMessage: string
  ): Promise<void> {
    // Update message with error
    await this.messageRepository.updateWithError(
      messageId,
      `I encountered an error while analyzing your data: ${errorMessage}. Please try again or contact support if the issue persists.`
    );

    // Mark job as failed (handles retry logic internally)
    const updatedJob = await this.jobRepository.markFailed(jobId, errorMessage);

    // If job is permanently failed (exceeded retries), update chat status
    if (updatedJob.status === 'failed') {
      await this.chatRepository.updateStatus(chatId, 'error');
    }

    this.logger.log(`Job ${jobId} failed: ${errorMessage}`);
  }

  /**
   * Update placeholder message with processing status
   */
  async updatePlaceholderMessage(messageId: string, statusMessage: string): Promise<void> {
    await this.messageRepository.update(messageId, {
      content: statusMessage,
    });
  }

  /**
   * Get current job state
   */
  async getJobState(jobId: string): Promise<{
    status: string;
    progress: number;
    retryCount: number;
    canRetry: boolean;
  }> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    return {
      status: job.status,
      progress: job.progress,
      retryCount: job.retryCount,
      canRetry: job.retryCount < job.maxRetries,
    };
  }
}

export default ProgressTrackerService;
