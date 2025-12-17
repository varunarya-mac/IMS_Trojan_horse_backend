/**
 * Context Service
 * Manages chat context including message history and CSV data
 */

import { MessageRepository } from '@lib/repositories/message.repository.js';
import { ChatContextRepository } from '@lib/repositories/context.repository.js';
import { getStorage, BUCKET_IDS } from '@lib/utils/db.js';
import type { Logger } from '@lib/types/logger.js';
import { createNoOpLogger } from '@lib/types/logger.js';
import type { MessageContext, CSVDataForProcessor } from './processor-invoker.js';
import { CSVProcessorService, CSVSamplerService } from './csv.service.js';

/**
 * Context for chat processing
 */
export interface ChatProcessingContext {
  messageContext: MessageContext[];
  csvData: CSVDataForProcessor | null;
  hasValidContext: boolean;
}

/**
 * Context Service
 */
export class ContextService {
  private readonly messageRepository: MessageRepository;
  private readonly contextRepository: ChatContextRepository;
  private readonly logger: Logger;
  private readonly messageContextCount: number;

  constructor(logger?: Logger) {
    this.logger = logger || createNoOpLogger();
    this.messageRepository = new MessageRepository(this.logger);
    this.contextRepository = new ChatContextRepository(this.logger);
    this.messageContextCount = parseInt(process.env.CONTEXT_MESSAGE_COUNT || '3', 10);
  }

  /**
   * Get context for message processing
   */
  async getContextForProcessing(
    chatId: string,
    csvFileId?: string
  ): Promise<ChatProcessingContext> {
    // Get last N messages for context
    const messageContext = await this.getMessageContext(chatId);

    // Get or load CSV data
    let csvData: CSVDataForProcessor | null = null;

    if (csvFileId) {
      // New CSV file provided - process it
      csvData = await this.processAndCacheCSV(chatId, csvFileId);
    } else {
      // Try to get cached CSV data
      csvData = await this.getCachedCSVData(chatId);
    }

    return {
      messageContext,
      csvData,
      hasValidContext: csvData !== null || messageContext.length > 0,
    };
  }

  /**
   * Get last N messages for context
   */
  async getMessageContext(chatId: string): Promise<MessageContext[]> {
    const result = await this.messageRepository.findByChatId(chatId, {
      limit: this.messageContextCount * 2, // Get pairs (user + assistant)
      orderBy: '$createdAt',
      orderDirection: 'desc',
    });

    // Convert to message context format and reverse to chronological order
    return result.documents
      .slice(0, this.messageContextCount * 2)
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content.substring(0, 500), // Truncate long messages
        timestamp: msg.$createdAt,
      }))
      .reverse();
  }

  /**
   * Process and cache CSV file
   */
  async processAndCacheCSV(chatId: string, csvFileId: string): Promise<CSVDataForProcessor | null> {
    try {
      const storage = getStorage();

      // Download file
      const fileBuffer = await storage.getFileDownload(BUCKET_IDS.REFRIGERATION_FILES, csvFileId);
      const content = Buffer.from(fileBuffer);

      // Get file info
      const fileInfo = await storage.getFile(BUCKET_IDS.REFRIGERATION_FILES, csvFileId);

      // Parse CSV
      const csvProcessor = new CSVProcessorService();
      const parseResult = await csvProcessor.parse(content, { maxRows: 50000 });

      // Sample data
      const sampler = new CSVSamplerService();
      const recommendedSize = sampler.getRecommendedSampleSize(
        parseResult.totalRows,
        fileInfo.sizeOriginal
      );

      const timestampColumn = parseResult.headers.find(
        h => h.toLowerCase().includes('timestamp') ||
             h.toLowerCase() === 'time' ||
             h.toLowerCase() === 'date'
      );

      const sampleResult = sampler.sample(parseResult.rows, {
        maxSamples: recommendedSize,
        timestampColumn,
        preserveAnomalies: true,
        anomalyBudget: 0.1,
      });

      const csvData: CSVDataForProcessor = {
        headers: parseResult.headers,
        rows: sampleResult.rows,
        totalRows: parseResult.totalRows,
        sampleSize: sampleResult.sampleSize,
        fileInfo: {
          fileId: csvFileId,
          fileName: fileInfo.name,
          fileSize: fileInfo.sizeOriginal,
        },
      };

      // Cache for future requests
      await this.contextRepository.createOrUpdate(chatId, csvFileId, {
        headers: csvData.headers,
        rows: csvData.rows,
        totalRows: csvData.totalRows,
        sampleSize: csvData.sampleSize,
        sampleRate: sampleResult.sampleRate,
        samplingMethod: sampleResult.samplingMethod,
        wasTruncated: parseResult.wasTruncated,
        fileInfo: {
          fileId: csvFileId,
          fileName: fileInfo.name,
          fileSize: fileInfo.sizeOriginal,
          uploadedAt: fileInfo.$createdAt,
        },
      });

      this.logger.log(`Processed and cached CSV: ${csvFileId}, ${sampleResult.sampleSize} samples`);

      return csvData;
    } catch (error) {
      this.logger.error(`Failed to process CSV: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Get cached CSV data for chat
   */
  async getCachedCSVData(chatId: string): Promise<CSVDataForProcessor | null> {
    const cached = await this.contextRepository.getCachedCsvData(chatId);

    if (!cached) {
      return null;
    }

    return {
      headers: cached.headers,
      rows: cached.rows,
      totalRows: cached.totalRows,
      sampleSize: cached.sampleSize,
      fileInfo: cached.fileInfo,
    };
  }

  /**
   * Clear context for chat
   */
  async clearContext(chatId: string): Promise<void> {
    await this.contextRepository.deleteByChatId(chatId);
  }
}

export default ContextService;
