/**
 * Processor Invoker Service
 * Synchronously invokes fn-chat-processor for message processing
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
 * Process message result
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
   * Invoke processor to handle message
   */
  async processMessage(request: ProcessMessageRequest): Promise<ProcessMessageResult> {
    const execution = await this.functions.createExecution(
      this.functionId,
      JSON.stringify({
        action: 'process_message',
        chatId: request.chatId,
        messageId: request.messageId,
        userQuestion: request.userQuestion,
        csvData: request.csvData,
        messageContext: request.messageContext,
      }),
      false, // async = false (synchronous)
      '/',
      ExecutionMethod.POST,
      { 'Content-Type': 'application/json' }
    );

    // Check execution status
    if (execution.status !== 'completed') {
      throw new Error(`Processor execution failed: ${execution.errors || 'Unknown error'}`);
    }

    // Parse response
    const response = JSON.parse(execution.responseBody);

    if (!response.success) {
      throw new Error(response.error?.message || 'Processing failed');
    }

    return response.data as ProcessMessageResult;
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
