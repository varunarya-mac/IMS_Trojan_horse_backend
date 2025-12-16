/**
 * Types for fn-analysis-engine
 */

/**
 * Function request payload
 */
export interface AnalysisEngineRequest {
  action: 'analyze' | 'semantic_check' | 'generate_graph';
  chatId: string;
  messageId: string;
  userQuestion: string;
  csvData?: CSVDataForAnalysis;
  graphConfig?: GraphConfig;
}

/**
 * CSV data provided for analysis
 */
export interface CSVDataForAnalysis {
  summary: string;
  metadata: {
    fileName: string;
    rowCount: number;
    columnCount: number;
    columns: string[];
    timeRange?: {
      start: string;
      end: string;
      durationHours: number;
    };
    deviceType?: string;
    storeInfo?: Record<string, unknown>;
  };
  statistics?: Array<{
    column: string;
    type: string;
    min?: number;
    max?: number;
    mean?: number;
    stdDev?: number;
  }>;
  anomalies?: Array<{
    row: number;
    column: string;
    value: number;
    type: string;
    description: string;
  }>;
  sampleData?: Record<string, string>[];
}

/**
 * Graph configuration
 */
export interface GraphConfig {
  type: 'line' | 'bar' | 'scatter';
  title: string;
  xAxis: {
    column: string;
    label?: string;
  };
  yAxis: {
    columns: string[];
    label?: string;
  };
  data: Record<string, string>[];
  options?: {
    showLegend?: boolean;
    colorScheme?: string[];
  };
}

/**
 * Function response payload
 */
export interface AnalysisEngineResponse {
  success: boolean;
  action: string;
  data?: AnalysisResult | SemanticCheckResult | GraphResult;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Analysis result
 */
export interface AnalysisResult {
  content: string;
  summaryData: {
    summary: string;
    recommendations: Array<{
      title: string;
      description: string;
      priority: 'high' | 'medium' | 'low';
      category: string;
    }>;
    datapoints: Array<{
      label: string;
      value: string | number;
      unit?: string;
      trend?: 'up' | 'down' | 'stable';
    }>;
    graphRecommendation?: {
      type: 'line' | 'bar' | 'scatter';
      title: string;
      xColumn: string;
      yColumns: string[];
      reason: string;
    };
  };
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  processingTime: number;
}

/**
 * Semantic check result (Layer 2 guardrail)
 */
export interface SemanticCheckResult {
  allowed: boolean;
  confidence: number;
  reason?: string;
  suggestion?: string;
}

/**
 * Graph generation result
 */
export interface GraphResult {
  graphImageId: string;
  graphUrl: string;
  width: number;
  height: number;
}

/**
 * Appwrite Function Context
 */
export interface FunctionContext {
  req: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
    bodyRaw: string;
    query: Record<string, string>;
  };
  res: {
    send: (body: string, status?: number, headers?: Record<string, string>) => unknown;
    json: (body: unknown, status?: number, headers?: Record<string, string>) => unknown;
    empty: () => unknown;
  };
  log: (message: string) => void;
  error: (message: string) => void;
}
