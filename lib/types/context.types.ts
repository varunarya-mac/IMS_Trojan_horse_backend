/**
 * Chat Context Types
 * Types for managing chat context including cached CSV data
 */

import type { BaseEntity } from './entities.js';
import type { ColumnStatistics, DetectedAnomaly } from './csv.types.js';

// Re-export for convenience
export type { ColumnStatistics, DetectedAnomaly } from './csv.types.js';

/**
 * Chat context entity - stores cached CSV data per chat session
 */
export interface ChatContextEntity extends BaseEntity {
  /** Reference to the chat this context belongs to */
  chatId: string;

  /** Parsed CSV data as JSON string (sampled for analysis) */
  csvData: string | null;

  /** Reference to the original CSV file */
  csvFileId: string | null;

  /** When the context was last updated */
  lastUpdated: string;

  /** When this context expires (for cleanup) */
  expiresAt: string;
}

/**
 * Parsed CSV data structure for context storage
 * (Different from csv.types.ts ParsedCSVData - this is for context caching)
 */
export interface CachedCSVData {
  /** CSV column headers */
  headers: string[];

  /** Sample rows for analysis (up to configured limit) */
  rows: Record<string, string>[];

  /** Total row count in original file */
  totalRows: number;

  /** Number of rows in sample */
  sampleSize: number;

  /** Sampling rate applied */
  sampleRate: number;

  /** Sampling method used */
  samplingMethod: 'full' | 'stratified' | 'anomaly_preserving';

  /** Whether data was truncated */
  wasTruncated: boolean;

  /** Column statistics */
  columnStats?: ColumnStatistics[];

  /** Detected anomalies */
  anomalies?: DetectedAnomaly[];

  /** File metadata */
  fileInfo: {
    fileId: string;
    fileName: string;
    fileSize: number;
    uploadedAt: string;
  };
}

/**
 * Chat context DTO for API responses
 */
export interface ChatContextDTO {
  chatId: string;
  hasCsvData: boolean;
  csvFileId: string | null;
  csvSampleSize: number | null;
  lastUpdated: string;
  expiresAt: string;
}

/**
 * Create context request (internal)
 */
export interface CreateContextRequest {
  chatId: string;
  csvFileId: string;
  csvData: CachedCSVData;
  expiryHours?: number;
}

/**
 * Update context request (internal)
 */
export interface UpdateContextRequest {
  csvData?: CachedCSVData;
  csvFileId?: string;
  expiryHours?: number;
}
