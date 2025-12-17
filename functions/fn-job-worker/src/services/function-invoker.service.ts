/**
 * Function Invoker Service
 * Invokes other Appwrite functions for job processing
 */

import { getFunctions } from '@lib/utils/db.js';
import type { FunctionInvocationResult } from '../types.js';
import { ExecutionMethod } from 'node-appwrite';

/**
 * Function IDs for invoking other functions
 */
const FUNCTION_IDS = {
  CSV_HANDLER: process.env.CSV_HANDLER_FUNCTION_ID || 'fn-csv-handler',
  ANALYSIS_ENGINE: process.env.ANALYSIS_ENGINE_FUNCTION_ID || 'fn-analysis-engine',
};

/**
 * Function Invoker Service
 */
export class FunctionInvokerService {
  private readonly log: (message: string) => void;
  private readonly logError: (message: string) => void;

  constructor(logger: { log: (message: string) => void; error: (message: string) => void }) {
    this.log = logger.log;
    this.logError = logger.error;
  }

  /**
   * Invoke CSV Handler function
   */
  async invokeCSVHandler<T>(
    action: 'validate' | 'process' | 'extract_for_graph',
    fileId: string,
    options?: Record<string, unknown>
  ): Promise<FunctionInvocationResult<T>> {
    return this.invokeFunction<T>(FUNCTION_IDS.CSV_HANDLER, {
      action,
      fileId,
      options,
    });
  }

  /**
   * Invoke Analysis Engine function
   */
  async invokeAnalysisEngine<T>(
    action: 'analyze' | 'semantic_check' | 'generate_graph',
    payload: Record<string, unknown>
  ): Promise<FunctionInvocationResult<T>> {
    return this.invokeFunction<T>(FUNCTION_IDS.ANALYSIS_ENGINE, {
      action,
      ...payload,
    });
  }

  /**
   * Generic function invocation
   */
  private async invokeFunction<T>(
    functionId: string,
    payload: Record<string, unknown>
  ): Promise<FunctionInvocationResult<T>> {
    const functions = getFunctions();

    try {
      this.log(`Invoking function: ${functionId}`);

      const execution = await functions.createExecution(
        functionId,
        JSON.stringify(payload),
        false, // async = false (wait for response)
        '/', // path
        ExecutionMethod.POST // method
      );

      // Parse response
      if (execution.status === 'completed') {
        try {
          const response = JSON.parse(execution.responseBody);
          return {
            success: response.success === true,
            data: response.data as T,
            error: response.error,
          };
        } catch {
          return {
            success: false,
            error: {
              code: 'PARSE_ERROR',
              message: 'Failed to parse function response',
              details: execution.responseBody,
            },
          };
        }
      }

      // Execution failed
      return {
        success: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: `Function execution failed: ${execution.status}`,
          details: {
            status: execution.status,
            errors: execution.errors,
            logs: execution.logs,
          },
        },
      };
    } catch (error) {
      this.logError(`Function invocation error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: {
          code: 'INVOCATION_ERROR',
          message: error instanceof Error ? error.message : 'Function invocation failed',
        },
      };
    }
  }

  /**
   * Validate CSV file
   */
  async validateCSV(fileId: string): Promise<FunctionInvocationResult<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    detectedColumns: string[];
  }>> {
    return this.invokeCSVHandler('validate', fileId, { checkColumns: true });
  }

  /**
   * Process CSV file
   */
  async processCSV(fileId: string, options?: {
    sampleSize?: number;
    calculateStatistics?: boolean;
    detectAnomalies?: boolean;
  }): Promise<FunctionInvocationResult<{
    metadata: Record<string, unknown>;
    statistics: Array<Record<string, unknown>>;
    anomalies: Array<Record<string, unknown>>;
    summary: string;
  }>> {
    return this.invokeCSVHandler('process', fileId, options);
  }

  /**
   * Extract data for graph
   */
  async extractForGraph(fileId: string, options: {
    columns: string[];
    maxDataPoints?: number;
    aggregation?: 'none' | 'hourly' | 'daily';
  }): Promise<FunctionInvocationResult<{
    columns: string[];
    rows: Record<string, string>[];
    rowCount: number;
  }>> {
    return this.invokeCSVHandler('extract_for_graph', fileId, options);
  }

  /**
   * Run AI analysis
   */
  async analyzeData(payload: {
    chatId: string;
    messageId: string;
    userQuestion: string;
    csvData: Record<string, unknown>;
  }): Promise<FunctionInvocationResult<{
    content: string;
    summaryData: Record<string, unknown>;
    tokenUsage: Record<string, number>;
    processingTime: number;
  }>> {
    return this.invokeAnalysisEngine('analyze', payload);
  }

  /**
   * Generate graph
   */
  async generateGraph(payload: {
    messageId: string;
    graphConfig: {
      type: string;
      title: string;
      xAxis: { column: string; label?: string };
      yAxis: { columns: string[]; label?: string };
      data: Record<string, string>[];
    };
  }): Promise<FunctionInvocationResult<{
    graphImageId: string;
    graphUrl: string;
  }>> {
    return this.invokeAnalysisEngine('generate_graph', payload);
  }
}

export default FunctionInvokerService;
