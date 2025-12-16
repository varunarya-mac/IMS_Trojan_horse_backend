/**
 * Message Entity Types
 * These interfaces represent message-related documents stored in Appwrite collections
 */

import type { BaseEntity } from './entities.js';

/**
 * Message role enum
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Message content type enum
 */
export type MessageContentType = 'text' | 'summary' | 'graph' | 'error';

/**
 * Datapoint status enum
 */
export type DatapointStatus = 'Critical' | 'Warning' | 'Okay';

/**
 * Graph type enum
 */
export type GraphType =
  | 'temperature_timeline'
  | 'defrost_cycles'
  | 'alarm_patterns'
  | 'pressure_timeline'
  | 'compressor_status';

/**
 * Message entity - represents a chat message
 */
export interface MessageEntity extends BaseEntity {
  /** Reference to parent chat */
  chatId: string;

  /** Who sent this message */
  role: MessageRole;

  /** Text content of the message */
  content: string;

  /** Type of content in this message */
  contentType: MessageContentType;

  /** Structured summary data (JSON string) - for assistant messages */
  summaryData: string | null;

  /** Reference to generated graph image in storage */
  graphImageId: string | null;

  /** Datapoints table data (JSON string) */
  datapointsData: string | null;

  /** Time taken to process this message in milliseconds */
  processingTime: number | null;

  /** Token usage information (JSON string) */
  tokenUsage: string | null;
}

/**
 * Recommendation from AI analysis
 */
export interface Recommendation {
  /** Short title, e.g., "Refrigerant Undercharge" */
  title: string;

  /** Detailed description of the issue */
  description: string;

  /** AI confidence score 0-100 */
  confidence: number;

  /** List of recommended actions */
  recommendedActions: string[];

  /** Signals/evidence that led to this recommendation */
  evidenceTrail: string[];
}

/**
 * Summary from AI analysis
 */
export interface Summary {
  /** Summary title, e.g., "Coil Iced / Defrost Failure" */
  title: string;

  /** Detailed summary text */
  description: string;

  /** High-level recommended actions */
  recommendedActions: string[];
}

/**
 * Datapoint from AI analysis
 */
export interface Datapoint {
  /** Signal name, e.g., "Residual Drift" */
  name: string;

  /** Metric value, e.g., "slope=0.00" */
  metric: string;

  /** Current status */
  status: DatapointStatus;

  /** Historical count (if applicable) */
  history: number | null;
}

/**
 * Alert point for graph highlighting
 */
export interface AlertPoint {
  timestamp: string;
  type: 'high_temp' | 'low_temp' | 'defrost_failure' | 'anomaly';
  value?: number;
}

/**
 * Graph recommendation from AI analysis
 */
export interface GraphRecommendation {
  /** Whether a graph should be generated */
  shouldGenerateGraph: boolean;

  /** Type of graph to generate */
  graphType: GraphType;

  /** CSV columns to include in the graph */
  columns: string[];

  /** Chart title */
  title: string;

  /** Specific timestamps to highlight as alerts */
  highlightAlerts?: AlertPoint[];
}

/**
 * Structured summary returned by AI analysis
 */
export interface SummaryData {
  recommendations: Recommendation[];
  summary: Summary;
  datapoints: Datapoint[];
  graphRecommendation: GraphRecommendation | null;
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

/**
 * Message DTO for API responses
 */
export interface MessageDTO {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  contentType: MessageContentType;
  summaryData: SummaryData | null;
  graphImageId: string | null;
  graphImageUrl: string | null;
  datapointsData: Datapoint[] | null;
  processingTime: number | null;
  tokenUsage: TokenUsage | null;
  createdAt: string;
}

/**
 * Send message request
 */
export interface SendMessageRequest {
  content: string;            // User's question
  fileId?: string;            // Optional: pre-uploaded CSV file ID
}

/**
 * Send message response
 */
export interface SendMessageResponse {
  messageId: string;
  chatId: string;
  role: 'user';
  content: string;
  createdAt: string;

  /** If immediate response (no file, simple question) */
  response?: {
    messageId: string;
    content: string;
    contentType: MessageContentType;
    summaryData?: SummaryData;
  };

  /** If background processing required */
  job?: {
    jobId: string;
    status: string;
    estimatedTime: number; // seconds
  };
}
