/**
 * Analysis Engine Types
 * These interfaces represent AI analysis input/output structures
 */

import type { ParsedCSVData } from './csv.types.js';
import type { SummaryData, TokenUsage, GraphType } from './message.types.js';

/**
 * Analysis engine input (internal function)
 */
export interface AnalysisEngineInput {
  chatId: string;
  messageId: string;
  userQuestion: string;
  csvFileId: string;
  csvSummary: ParsedCSVData;
  generateGraph: boolean;
}

/**
 * Analysis engine output (internal function)
 */
export interface AnalysisEngineOutput {
  success: boolean;

  /** Analysis results */
  analysis?: {
    summaryData: SummaryData;
    tokenUsage: TokenUsage;
    processingTimeMs: number;
  };

  /** Graph generation results (if generateGraph was true) */
  graph?: {
    imageId: string;
    imageUrl: string;
    chartType: GraphType;
  };

  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Guardrail check result
 */
export interface GuardrailCheckResult {
  allowed: boolean;

  /** For rejected questions */
  rejectionReason?: string;
  suggestion?: string;

  /** For rejected CSV files */
  csvRejection?: {
    reason: string;
    detectedColumns: string[];
    suggestion: string;
  };

  /** Matched refrigeration keywords (for allowed) */
  matchedKeywords?: string[];
}

/**
 * Layer 2 guardrail input (semantic check)
 */
export interface Layer2GuardrailInput {
  question: string;
  hasCSV: boolean;
  csvColumns?: string[];
}

/**
 * Layer 2 guardrail output
 */
export interface Layer2GuardrailOutput {
  isRefrigerationRelated: boolean;
  confidence: number;
  reasoning: string;
}

/**
 * OpenAI analysis response structure
 */
export interface AIAnalysisResponse {
  recommendations: Array<{
    title: string;
    description: string;
    confidence: number;
    recommendedActions: string[];
    evidenceTrail: string[];
  }>;
  summary: {
    title: string;
    description: string;
    recommendedActions: string[];
  };
  datapoints: Array<{
    name: string;
    metric: string;
    status: 'Critical' | 'Warning' | 'Okay';
    history: number | null;
  }>;
  graphRecommendation: {
    shouldGenerateGraph: boolean;
    graphType: GraphType;
    columns: string[];
    title: string;
    highlightAlerts?: Array<{
      timestamp: string;
      type: string;
      value?: number;
    }>;
  } | null;
}

/**
 * Graph generation config
 */
export interface GraphGenerationConfig {
  graphType: GraphType;
  columns: string[];
  title: string;
  csvFileId: string;
  maxDataPoints?: number;
  highlightAlerts?: Array<{
    timestamp: string;
    type: string;
    value?: number;
  }>;
}

/**
 * Graph generation result
 */
export interface GraphGenerationResult {
  success: boolean;
  imageId?: string;
  imageUrl?: string;
  chartType?: GraphType;
  error?: {
    code: string;
    message: string;
  };
}
