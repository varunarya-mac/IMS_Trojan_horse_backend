/**
 * CSV Processing Types
 * These interfaces represent CSV validation and parsing structures
 */

import type { CSVMetadata, StoreInfo, DeviceType } from './chat.types.js';
import type { AlertPoint } from './message.types.js';

/**
 * CSV error code enum
 */
export type CSVErrorCode =
  | 'INVALID_FORMAT'           // Not a valid CSV
  | 'EMPTY_FILE'               // No data rows
  | 'MISSING_HEADERS'          // No header row
  | 'NOT_REFRIGERATION_DATA'   // Missing refrigeration columns
  | 'INVALID_TIMESTAMP'        // Timestamp column invalid
  | 'FILE_TOO_LARGE'           // Exceeds 50MB
  | 'ENCODING_ERROR';          // Invalid character encoding

/**
 * Anomaly type enum
 */
export type AnomalyType =
  | 'temperature_spike'
  | 'temperature_drop'
  | 'flatline'
  | 'missing_data'
  | 'out_of_range'
  | 'rapid_change';

/**
 * CSV validation error
 */
export interface CSVValidationError {
  code: CSVErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * CSV validation warning
 */
export interface CSVValidationWarning {
  code: string;
  message: string;
}

/**
 * Result of CSV validation
 */
export interface CSVValidationResult {
  isValid: boolean;
  errors: CSVValidationError[];
  warnings: CSVValidationWarning[];
  detectedType: DeviceType | null;
  detectedColumns: string[];
  missingRequiredColumns: string[];
}

/**
 * Required columns for refrigeration data validation
 */
export interface RefrigerationColumnSchema {
  case: {
    required: string[];
    optional: string[];
    temperature: string[];
  };
  pack: {
    required: string[];
    optional: string[];
    temperature: string[];
  };
}

/**
 * Column statistics for numeric/string columns
 */
export interface ColumnStatistics {
  columnName: string;
  dataType: 'number' | 'string' | 'boolean' | 'datetime';

  /** For numeric columns */
  min?: number;
  max?: number;
  mean?: number;
  stdDev?: number;

  /** For all columns */
  nullCount: number;
  uniqueCount: number;

  /** Sample values */
  sampleValues: (string | number | boolean)[];
}

/**
 * Detected anomaly in data
 */
export interface DetectedAnomaly {
  type: AnomalyType;
  columnName: string;
  timestamp?: string;
  value?: number;
  expectedRange?: { min: number; max: number };
  description: string;
}

/**
 * Parsed CSV data ready for analysis
 */
export interface ParsedCSVData {
  headers: string[];
  rowCount: number;
  metadata: CSVMetadata;
  storeInfo: StoreInfo;

  /** Statistical summary of numeric columns */
  statistics: ColumnStatistics[];

  /** Detected anomalies during parsing */
  detectedAnomalies: DetectedAnomaly[];

  /** Representative sample of rows (for AI context) */
  sampleRows: Record<string, unknown>[];

  /** Full data (only populated for files < 10MB) */
  fullData?: Record<string, unknown>[];
}

/**
 * Graph series for visualization
 */
export interface GraphSeries {
  name: string;
  values: (number | null)[];
  color: string;
  type: 'line' | 'area' | 'scatter';
}

/**
 * Time period for annotations
 */
export interface TimePeriod {
  start: string;
  end: string;
  label?: string;
}

/**
 * Data prepared for graph generation
 */
export interface GraphData {
  timestamps: string[];
  series: GraphSeries[];
  defrostPeriods: TimePeriod[];
  alertPoints: AlertPoint[];
}

/**
 * CSV handler input (internal function)
 */
export interface CSVHandlerInput {
  action: 'validate' | 'process' | 'extract_for_graph';
  fileId: string;
  chatId: string;

  /** For 'extract_for_graph' action */
  graphConfig?: {
    columns: string[];
    maxDataPoints?: number;
  };
}

/**
 * CSV handler output (internal function)
 */
export interface CSVHandlerOutput {
  success: boolean;

  /** For 'validate' action */
  validation?: CSVValidationResult;

  /** For 'process' action */
  parsedData?: ParsedCSVData;

  /** For 'extract_for_graph' action */
  graphData?: GraphData;

  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
