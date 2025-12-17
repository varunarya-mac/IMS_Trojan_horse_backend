/**
 * Search Service
 * Orchestrates vector search operations
 */

import { EmbeddingService } from './embedding.service.js';
import { ChromaDBService, type ChromaSearchResult } from './chromadb.service.js';
import type {
  SearchResult,
  VectorSearchResultData,
  VectorSearchHealthData,
} from '../types.js';

/**
 * Search Service Configuration
 */
export interface SearchServiceConfig {
  chromadb: {
    apiKey: string;
    tenant: string;
    database: string;
  };
  openai: {
    apiKey: string;
    embeddingModel: string;
  };
}

/**
 * Search Service for handling vector search operations
 */
export class SearchService {
  private readonly embeddingService: EmbeddingService;
  private readonly chromadbService: ChromaDBService;
  private initialized: boolean = false;

  constructor(config: SearchServiceConfig) {
    this.embeddingService = new EmbeddingService({
      apiKey: config.openai.apiKey,
      model: config.openai.embeddingModel,
    });

    this.chromadbService = new ChromaDBService({
      apiKey: config.chromadb.apiKey,
      tenant: config.chromadb.tenant,
      database: config.chromadb.database,
    });
  }

  /**
   * Initialize the service (connect to ChromaDB)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.chromadbService.connect();
    this.initialized = true;
  }

  /**
   * Search for relevant documents
   */
  async search(
    query: string,
    topK: number = 5,
    minScore: number = 0.5
  ): Promise<VectorSearchResultData> {
    const startTime = Date.now();

    // Ensure initialized
    await this.initialize();

    // Generate query embedding
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    // Search in ChromaDB
    const chromaResults = await this.chromadbService.search(
      queryEmbedding,
      topK,
      minScore
    );

    // Convert to our format
    const results: SearchResult[] = chromaResults.map((result: ChromaSearchResult) => ({
      content: result.content,
      score: result.score,
      metadata: {
        documentId: String(result.metadata.documentId || ''),
        documentName: String(result.metadata.documentName || ''),
        section: result.metadata.section ? String(result.metadata.section) : undefined,
        chunkIndex: Number(result.metadata.chunkIndex || 0),
      },
    }));

    const searchTimeMs = Date.now() - startTime;

    return {
      results,
      query,
      totalMatches: results.length,
      searchTimeMs,
    };
  }

  /**
   * Get document summary
   */
  async getSummary(): Promise<string | null> {
    await this.initialize();
    return this.chromadbService.getSummary();
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<VectorSearchHealthData> {
    try {
      // Check ChromaDB connection
      const chromaConnected = await this.chromadbService.testConnection();

      // Check embedding service
      const embeddingsAvailable = await this.embeddingService.isAvailable();

      // Get collection info if connected
      let collectionInfo = null;
      if (chromaConnected) {
        await this.initialize();
        collectionInfo = await this.chromadbService.getCollectionInfo();
      }

      const healthy = chromaConnected && embeddingsAvailable;

      return {
        healthy,
        chromadbConnected: chromaConnected,
        embeddingsAvailable,
        collectionName: collectionInfo?.name,
        documentCount: collectionInfo?.documentCount,
      };
    } catch (error) {
      return {
        healthy: false,
        chromadbConnected: false,
        embeddingsAvailable: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export default SearchService;
