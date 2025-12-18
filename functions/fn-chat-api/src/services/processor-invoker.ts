/**
 * Processor Invoker Service
 * Asynchronously invokes fn-chat-processor for message processing
 * Uses async execution to avoid timeout issues on Appwrite free tier
 */

import { Client, Functions, ExecutionMethod } from 'node-appwrite';

/**
 * Message context for processor
 */
export interface MessageContext {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * CSV data for processor
 */
export interface CSVDataForProcessor {
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
 * Process message request
 */
export interface ProcessMessageRequest {
  chatId: string;
  messageId: string;
  userQuestion: string;
  csvData?: CSVDataForProcessor;
  messageContext?: MessageContext[];
}

/**
 * Process message result (returned when sync)
 */
export interface ProcessMessageResult {
  content: string;
  recommendations?: Array<{
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
  }>;
  dataPoints?: Array<{
    label: string;
    value: string | number;
    unit?: string;
  }>;
  graph?: {
    graphImageId: string;
    graphUrl: string;
    width: number;
    height: number;
  };
  ragContext?: string[];
  processingTimeMs: number;
}

/**
 * Async processing result (returned immediately)
 */
export interface AsyncProcessingResult {
  executionId: string;
  status: 'processing';
}

/**
 * Processor Invoker Service
 */
export class ProcessorInvokerService {
  private readonly client: Client;
  private readonly functions: Functions;
  private readonly functionId: string;

  constructor() {
    const endpoint = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
    const projectId = process.env.APPWRITE_PROJECT_ID || '';
    const apiKey = process.env.APPWRITE_API_KEY || '';

    this.functionId = process.env.FN_CHAT_PROCESSOR_ID || 'fn-chat-processor';

    this.client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey);

    this.functions = new Functions(this.client);
  }

  /**
   * Start async processing of a message
   * Returns immediately with execution ID - processor will update DB when done
   */
  async startProcessingAsync(request: ProcessMessageRequest): Promise<AsyncProcessingResult> {
    // Build payload
    const payload = {
      action: 'process_message',
      chatId: request.chatId,
      messageId: request.messageId,
      userQuestion: request.userQuestion,
      csvData: request.csvData,
      messageContext: request.messageContext,
    };

    // Debug logging
    console.log('[ProcessorInvoker] Starting ASYNC processing');
    console.log('[ProcessorInvoker] Function ID:', this.functionId);
    console.log('[ProcessorInvoker] Chat ID:', request.chatId);
    console.log('[ProcessorInvoker] Message ID:', request.messageId);
    console.log('[ProcessorInvoker] Has CSV data:', !!request.csvData);

    const payloadString = JSON.stringify(payload);
    console.log('[ProcessorInvoker] Payload size:', payloadString.length, 'bytes');

    // Fire async execution - returns immediately
    const execution = await this.functions.createExecution(
      this.functionId,
      payloadString,
      true, // async = TRUE (fire and forget)
      '/',
      ExecutionMethod.POST,
      { 'Content-Type': 'application/json' }
    );

    console.log('[ProcessorInvoker] Async execution started:', execution.$id);
    console.log('[ProcessorInvoker] Initial status:', execution.status);

    return {
      executionId: execution.$id,
      status: 'processing',
    };
  }

  /**
   * Invoke processor to generate graph only
   */
  async generateGraph(
    chatId: string,
    graphConfig: {
      type: 'line' | 'bar' | 'scatter';
      title: string;
      xAxis: { column: string; label?: string };
      yAxis: { columns: string[]; label?: string };
      data: Record<string, string>[];
    }
  ): Promise<{
    graphImageId: string;
    graphUrl: string;
    width: number;
    height: number;
  }> {
    const execution = await this.functions.createExecution(
      this.functionId,
      JSON.stringify({
        action: 'generate_graph',
        chatId,
        graphConfig,
      }),
      false,
      '/',
      ExecutionMethod.POST,
      { 'Content-Type': 'application/json' }
    );

    if (execution.status !== 'completed') {
      throw new Error(`Graph generation failed: ${execution.errors || 'Unknown error'}`);
    }

    const response = JSON.parse(execution.responseBody);

    if (!response.success) {
      throw new Error(response.error?.message || 'Graph generation failed');
    }

    return response.data.graph;
  }
}

export default ProcessorInvokerService;
