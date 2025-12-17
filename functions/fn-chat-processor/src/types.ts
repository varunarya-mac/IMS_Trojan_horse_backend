/**
 * Chat Processor Function Types
 */

/**
 * Appwrite function context
 */
export interface FunctionContext {
  req: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
    bodyRaw: string;
  };
  res: {
    send: (body: string, statusCode?: number, headers?: Record<string, string>) => unknown;
    json: (body: unknown, statusCode?: number, headers?: Record<string, string>) => unknown;
  };
  log: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Chat processor request actions
 */
export type ProcessorAction = 'process_message' | 'generate_graph';

/**
 * Message context (last N messages)
 */
export interface MessageContext {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * CSV data for processing
 */
export interface CSVData {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  sampleSize: number;
  fileInfo: {
    fileId: string;
    fileName: string;
    fileSize: number;
  };
}

/**
 * Chat processor request body
 */
export interface ChatProcessorRequest {
  action: ProcessorAction;

  // For 'process_message' action
  chatId?: string;
  messageId?: string;
  userQuestion?: string;
  csvData?: CSVData;
  messageContext?: MessageContext[];

  // For 'generate_graph' action
  graphConfig?: GraphConfig;
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
 * Chat processor response
 */
export interface ChatProcessorResponse {
  success: boolean;
  action: ProcessorAction;
  data?: ProcessMessageResult | GenerateGraphResult;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Process message result
 */
export interface ProcessMessageResult {
  content: string;
  recommendations?: Recommendation[];
  dataPoints?: DataPoint[];
  graph?: GraphResult;
  ragContext?: string[];
  processingTimeMs: number;
}

/**
 * Recommendation from AI analysis
 */
export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action?: string;
}

/**
 * Data point from analysis
 */
export interface DataPoint {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
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
 * Generate graph result
 */
export interface GenerateGraphResult {
  graph: GraphResult;
}

/**
 * RAG search result
 */
export interface RAGResult {
  content: string;
  score: number;
  section?: string;
}

/**
 * Parsed AI response
 */
export interface ParsedAIResponse {
  summary: string;
  recommendations: Recommendation[];
  dataPoints: DataPoint[];
  shouldGenerateGraph: boolean;
  graphConfig?: GraphConfig;
}

/**
 * CSV row type
 */
export type CSVRow = Record<string, string>;

/**
 * Semantic check result
 */
export interface SemanticCheckResult {
  allowed: boolean;
  confidence: number;
  reason?: string;
  suggestion?: string;
}
