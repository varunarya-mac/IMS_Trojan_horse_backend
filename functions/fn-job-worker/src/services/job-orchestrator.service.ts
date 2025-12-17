/**
 * Job Orchestrator Service
 * Orchestrates the complete job processing pipeline
 */

import { FunctionInvokerService } from './function-invoker.service.js';
import { ProgressTrackerService } from './progress-tracker.service.js';
import type { ProcessingJobEntity } from '@lib/types/job.types.js';
import type { Logger } from '@lib/types/logger.js';
import type { JobProcessingResult } from '../types.js';

/**
 * Job Orchestrator Service
 */
export class JobOrchestratorService {
  private readonly functionInvoker: FunctionInvokerService;
  private readonly progressTracker: ProgressTrackerService;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.functionInvoker = new FunctionInvokerService(logger);
    this.progressTracker = new ProgressTrackerService(logger);
  }

  /**
   * Process a single job
   */
  async processJob(job: ProcessingJobEntity): Promise<JobProcessingResult> {
    const startTime = Date.now();
    const { $id: jobId, chatId, messageId, csvFileId, userQuestion } = job;

    this.logger.log(`Processing job ${jobId} for chat ${chatId}`);

    try {
      // Stage 1: Validate CSV (10%)
      await this.progressTracker.updateProgress(jobId, 'validating_csv');
      await this.progressTracker.updatePlaceholderMessage(messageId, 'Validating your CSV file...');

      const validationResult = await this.functionInvoker.validateCSV(csvFileId);
      if (!validationResult.success || !validationResult.data?.isValid) {
        const errors = validationResult.data?.errors || ['Unknown validation error'];
        throw new Error(`CSV validation failed: ${errors.join(', ')}`);
      }

      this.logger.log(`CSV validation passed for job ${jobId}`);

      // Stage 2: Parse CSV (30%)
      await this.progressTracker.updateProgress(jobId, 'parsing_csv');
      await this.progressTracker.updatePlaceholderMessage(messageId, 'Parsing refrigeration data...');

      const parseResult = await this.functionInvoker.processCSV(csvFileId, {
        calculateStatistics: true,
        detectAnomalies: true,
      });

      if (!parseResult.success || !parseResult.data) {
        throw new Error('CSV processing failed: ' + (parseResult.error?.message || 'Unknown error'));
      }

      this.logger.log(`CSV parsing completed for job ${jobId}`);

      // Stage 3: Analyze Data (70%)
      await this.progressTracker.updateProgress(jobId, 'calling_ai');
      await this.progressTracker.updatePlaceholderMessage(messageId, 'Analyzing data with AI...');

      const analysisResult = await this.functionInvoker.analyzeData({
        chatId,
        messageId,
        userQuestion,
        csvData: {
          summary: parseResult.data.summary,
          metadata: parseResult.data.metadata,
          statistics: parseResult.data.statistics,
          anomalies: parseResult.data.anomalies,
        },
      });

      if (!analysisResult.success || !analysisResult.data) {
        throw new Error('Analysis failed: ' + (analysisResult.error?.message || 'Unknown error'));
      }

      this.logger.log(`Analysis completed for job ${jobId}`);

      // Stage 4: Generate Graph if recommended (90%)
      let graphImageId: string | undefined;
      const summaryData = analysisResult.data.summaryData as {
        graphRecommendation?: {
          type: string;
          title: string;
          xColumn: string;
          yColumns: string[];
        };
      };

      if (summaryData?.graphRecommendation) {
        await this.progressTracker.updateProgress(jobId, 'generating_graph');
        await this.progressTracker.updatePlaceholderMessage(messageId, 'Generating visualization...');

        const graphRec = summaryData.graphRecommendation;

        // Extract data for graph
        const graphData = await this.functionInvoker.extractForGraph(csvFileId, {
          columns: [graphRec.xColumn, ...graphRec.yColumns],
          maxDataPoints: 500,
          aggregation: 'none',
        });

        if (graphData.success && graphData.data) {
          const graphResult = await this.functionInvoker.generateGraph({
            messageId,
            graphConfig: {
              type: graphRec.type,
              title: graphRec.title,
              xAxis: { column: graphRec.xColumn },
              yAxis: { columns: graphRec.yColumns },
              data: graphData.data.rows,
            },
          });

          if (graphResult.success && graphResult.data) {
            graphImageId = graphResult.data.graphImageId;
            this.logger.log(`Graph generated for job ${jobId}: ${graphImageId}`);
          }
        }
      }

      // Stage 5: Complete (100%)
      await this.progressTracker.updateProgress(jobId, 'saving_results');
      await this.progressTracker.markCompleted(jobId, messageId, chatId, {
        content: analysisResult.data.content,
        summaryData: analysisResult.data.summaryData,
        graphImageId,
        processingTime: analysisResult.data.processingTime,
        tokenUsage: analysisResult.data.tokenUsage,
      });

      const processingTime = Date.now() - startTime;
      this.logger.log(`Job ${jobId} completed in ${processingTime}ms`);

      return {
        jobId,
        success: true,
        processingTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Job ${jobId} failed: ${errorMessage}`);

      await this.progressTracker.markFailed(jobId, messageId, chatId, errorMessage);

      return {
        jobId,
        success: false,
        error: errorMessage,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Process multiple jobs
   */
  async processJobs(jobs: ProcessingJobEntity[]): Promise<JobProcessingResult[]> {
    const results: JobProcessingResult[] = [];

    for (const job of jobs) {
      const result = await this.processJob(job);
      results.push(result);

      // Small delay between jobs to prevent overwhelming the system
      await this.sleep(100);
    }

    return results;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default JobOrchestratorService;
