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
      this.logger.log(`[CSV] Starting CSV processing for chat: ${chatId}, fileId: ${csvFileId}`);
      const storage = getStorage();

      // Download file
      this.logger.log(`[CSV] Downloading file from storage...`);
      const fileBuffer = await storage.getFileDownload(BUCKET_IDS.REFRIGERATION_FILES, csvFileId);
      const content = Buffer.from(fileBuffer);
      this.logger.log(`[CSV] Downloaded file: ${csvFileId}, size: ${content.length} bytes`);

      // Get file info
      const fileInfo = await storage.getFile(BUCKET_IDS.REFRIGERATION_FILES, csvFileId);
      this.logger.log(`[CSV] File info: name=${fileInfo.name}, originalSize=${fileInfo.sizeOriginal}`);

      // Parse CSV
      this.logger.log(`[CSV] Parsing CSV content...`);
      const csvProcessor = new CSVProcessorService();
      const parseResult = await csvProcessor.parse(content, { maxRows: 50000 });
      this.logger.log(`[CSV] Parsed CSV: ${parseResult.totalRows} rows, ${parseResult.headers.length} columns, truncated=${parseResult.wasTruncated}`);
      this.logger.log(`[CSV] Headers: ${parseResult.headers.join(', ')}`);

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
      this.logger.log(`[CSV] Sampling: method=${sampleResult.samplingMethod}, original=${parseResult.totalRows}, sampled=${sampleResult.sampleSize}, rate=${sampleResult.sampleRate.toFixed(4)}`);

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

      // Cache only metadata (not rows) to avoid Appwrite document size limits
      // Rows will be re-processed from storage on subsequent requests
      const cacheData = {
        headers: csvData.headers,
        rows: [], // Don't cache rows - re-process from storage when needed
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
      };

      // Log the size of metadata being cached
      const cacheDataJson = JSON.stringify(cacheData);
      this.logger.log(`[CSV] Caching metadata only: ${cacheDataJson.length} bytes (rows excluded)`);

      try {
        await this.contextRepository.createOrUpdate(chatId, csvFileId, cacheData);
        this.logger.log(`[CSV] Metadata cached successfully for chat ${chatId}`);
      } catch (cacheError) {
        this.logger.error(`[CSV] Failed to cache metadata: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`);
        // Continue without caching - CSV data is still usable for this request
      }

      this.logger.log(`[CSV] Processing complete: ${csvFileId}, ${sampleResult.sampleSize} samples for chat ${chatId}`);

      return csvData;
    } catch (error) {
      this.logger.error(`[CSV] Failed to process CSV: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Get cached CSV data for chat
   * Since we only cache metadata, this re-processes the CSV from storage
   */
  async getCachedCSVData(chatId: string): Promise<CSVDataForProcessor | null> {
    const cached = await this.contextRepository.getCachedCsvData(chatId);

    if (!cached || !cached.fileInfo?.fileId) {
      this.logger.log(`[CSV] No cached metadata found for chat ${chatId}`);
      return null;
    }

    this.logger.log(`[CSV] Found cached metadata for chat ${chatId}, re-processing CSV from storage`);
    this.logger.log(`[CSV] Cached file: ${cached.fileInfo.fileName} (${cached.fileInfo.fileId})`);

    // Re-process the CSV from storage using cached file ID
    try {
      const storage = getStorage();

      // Download file from storage
      this.logger.log(`[CSV] Re-downloading CSV from storage...`);
      const fileBuffer = await storage.getFileDownload(BUCKET_IDS.REFRIGERATION_FILES, cached.fileInfo.fileId);
      const content = Buffer.from(fileBuffer);
      this.logger.log(`[CSV] Downloaded file: ${content.length} bytes`);

      // Parse CSV
      const csvProcessor = new CSVProcessorService();
      const parseResult = await csvProcessor.parse(content, { maxRows: 50000 });
      this.logger.log(`[CSV] Re-parsed CSV: ${parseResult.totalRows} rows, ${parseResult.headers.length} columns`);

      // Sample data
      const sampler = new CSVSamplerService();
      const recommendedSize = sampler.getRecommendedSampleSize(
        parseResult.totalRows,
        cached.fileInfo.fileSize
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
      this.logger.log(`[CSV] Re-sampling: ${sampleResult.sampleSize} samples from ${parseResult.totalRows} rows`);

      return {
        headers: parseResult.headers,
        rows: sampleResult.rows,
        totalRows: parseResult.totalRows,
        sampleSize: sampleResult.sampleSize,
        fileInfo: cached.fileInfo,
      };
    } catch (error) {
      this.logger.error(`[CSV] Failed to re-process CSV from storage: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Clear context for chat
   */
  async clearContext(chatId: string): Promise<void> {
    await this.contextRepository.deleteByChatId(chatId);
  }
}

export default ContextService;
