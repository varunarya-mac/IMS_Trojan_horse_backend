/**
 * Processing Job Entity Types
 * These interfaces represent job-related documents stored in Appwrite collections
 */

import type { BaseEntity } from './entities.js';

/**
 * Job type enum
 */
export type JobType =
  | 'csv_analysis'      // Full CSV analysis with summary
  | 'graph_generation'  // Generate graph only
  | 'follow_up';        // Follow-up question (uses existing context)

/**
 * Job status enum
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Job stage enum for progress tracking
 */
export type JobStage =
  | 'queued'              // 0%
  | 'validating_csv'      // 10%
  | 'parsing_csv'         // 20%
  | 'extracting_metadata' // 30%
  | 'preparing_summary'   // 40%
  | 'calling_ai'          // 50%
  | 'processing_response' // 70%
  | 'generating_graph'    // 80%
  | 'saving_results'      // 90%
  | 'completed';          // 100%

/**
 * Processing job entity - represents a background processing task
 */
export interface ProcessingJobEntity extends BaseEntity {
  /** Reference to the chat this job belongs to */
  chatId: string;

  /** Reference to the message being generated */
  messageId: string;

  /** User who owns this job */
  userId: string;

  /** Type of processing task */
  jobType: JobType;

  /** Current job status */
  status: JobStatus;

  /** Progress percentage 0-100 */
  progress: number;

  /** Human-readable progress message */
  progressMessage: string | null;

  /** Error message if job failed */
  errorMessage: string | null;

  /** Number of retry attempts made */
  retryCount: number;

  /** Maximum allowed retries */
  maxRetries: number;

  /** When processing started */
  startedAt: string | null;

  /** When processing completed */
  completedAt: string | null;

  /** The user's question (stored for job processing) */
  userQuestion: string;

  /** Reference to the CSV file to process */
  csvFileId: string;
}

/**
 * Job progress stage configuration
 */
export interface JobProgressStage {
  stage: JobStage;
  progress: number;
  message: string;
}

/**
 * Job progress map - maps stages to progress info
 */
export const JOB_PROGRESS_MAP: Record<JobStage, JobProgressStage> = {
  queued: { stage: 'queued', progress: 0, message: 'Job queued for processing' },
  validating_csv: { stage: 'validating_csv', progress: 10, message: 'Validating CSV file...' },
  parsing_csv: { stage: 'parsing_csv', progress: 20, message: 'Parsing CSV data...' },
  extracting_metadata: { stage: 'extracting_metadata', progress: 30, message: 'Extracting device information...' },
  preparing_summary: { stage: 'preparing_summary', progress: 40, message: 'Preparing data summary...' },
  calling_ai: { stage: 'calling_ai', progress: 50, message: 'Analyzing patterns with AI...' },
  processing_response: { stage: 'processing_response', progress: 70, message: 'Processing analysis results...' },
  generating_graph: { stage: 'generating_graph', progress: 80, message: 'Generating visualization...' },
  saving_results: { stage: 'saving_results', progress: 90, message: 'Saving results...' },
  completed: { stage: 'completed', progress: 100, message: 'Analysis complete' }
};

/**
 * Job DTO for API responses
 */
export interface ProcessingJobDTO {
  id: string;
  chatId: string;
  messageId: string;
  userId: string;
  jobType: JobType;
  status: JobStatus;
  progress: number;
  progressMessage: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/**
 * Get job status response
 */
export interface GetJobStatusResponse {
  jobId: string;
  chatId: string;
  messageId: string;
  status: JobStatus;
  progress: number;
  progressMessage: string | null;

  /** Populated when status is 'completed' */
  result?: {
    messageId: string;
    hasGraph: boolean;
    graphUrl?: string;
  };

  /** Populated when status is 'failed' */
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };

  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * Create job request (internal)
 */
export interface CreateJobRequest {
  chatId: string;
  messageId: string;
  userId: string;
  jobType: JobType;
  userQuestion: string;
  csvFileId: string;
}
