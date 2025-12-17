/**
 * ChromaDB Service
 * Handles vector database operations with ChromaDB Cloud
 */

import { CloudClient, type Collection, type QueryResponse, IncludeEnum, type Metadata } from 'chromadb';
import type { ChromaDBConfig } from '../types.js';

/**
 * Search result from ChromaDB
 */
export interface ChromaSearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * ChromaDB Service for vector database operations
 */
export class ChromaDBService {
  private client: CloudClient | null = null;
  private collection: Collection | null = null;
  private readonly config: ChromaDBConfig;

  constructor(config: ChromaDBConfig) {
    this.config = config;
  }

  /**
   * Initialize connection to ChromaDB Cloud
   */
  async connect(): Promise<void> {
    this.client = new CloudClient({
      apiKey: this.config.apiKey,
      tenant: this.config.tenant,
      database: this.config.database,
    });

    // Get or create collection (using database name as collection name)
    this.collection = await this.client.getOrCreateCollection({
      name: this.config.database,
      metadata: {
        description: 'IoT Refrigeration domain knowledge',
        'hnsw:space': 'cosine',
      },
    });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client !== null && this.collection !== null;
  }

  /**
   * Search for similar documents
   */
  async search(
    queryEmbedding: number[],
    topK: number = 5,
    minScore: number = 0.5
  ): Promise<ChromaSearchResult[]> {
    if (!this.collection) {
      throw new Error('ChromaDB collection not initialized');
    }

    const results: QueryResponse = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances],
    });

    // Convert results to our format
    const searchResults: ChromaSearchResult[] = [];

    if (results.ids && results.ids[0]) {
      for (let i = 0; i < results.ids[0].length; i++) {
        // ChromaDB returns distance, convert to similarity score
        // For cosine distance: similarity = 1 - distance
        const distance = results.distances?.[0]?.[i] ?? 1;
        const score = 1 - distance;

        // Filter by minimum score
        if (score < minScore) continue;

        searchResults.push({
          id: results.ids[0][i],
          content: results.documents?.[0]?.[i] ?? '',
          score,
          metadata: results.metadatas?.[0]?.[i] ?? {},
        });
      }
    }

    // Sort by score descending
    searchResults.sort((a, b) => b.score - a.score);

    return searchResults;
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(): Promise<{
    name: string;
    documentCount: number;
  } | null> {
    if (!this.collection) return null;

    const count = await this.collection.count();

    return {
      name: this.config.database,
      documentCount: count,
    };
  }

  /**
   * Get document summary (stored with ID 'document_summary')
   */
  async getSummary(): Promise<string | null> {
    if (!this.collection) {
      throw new Error('ChromaDB collection not initialized');
    }

    try {
      const result = await this.collection.get({
        ids: ['document_summary'],
        include: [IncludeEnum.Documents],
      });

      if (result.documents && result.documents.length > 0 && result.documents[0]) {
        return result.documents[0];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Add documents to collection (for setup script)
   */
  async addDocuments(
    ids: string[],
    documents: string[],
    embeddings: number[][],
    metadatas: Metadata[]
  ): Promise<void> {
    if (!this.collection) {
      throw new Error('ChromaDB collection not initialized');
    }

    // Add in batches of 100
    const batchSize = 100;

    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      const batchDocs = documents.slice(i, i + batchSize);
      const batchEmbeddings = embeddings.slice(i, i + batchSize);
      const batchMetadatas = metadatas.slice(i, i + batchSize);

      await this.collection.add({
        ids: batchIds,
        documents: batchDocs,
        embeddings: batchEmbeddings,
        metadatas: batchMetadatas,
      });
    }
  }

  /**
   * Delete all documents from collection (for re-indexing)
   */
  async clearCollection(): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }

    try {
      await this.client.deleteCollection({ name: this.config.database });
      this.collection = await this.client.createCollection({
        name: this.config.database,
        metadata: {
          description: 'IoT Refrigeration domain knowledge',
          'hnsw:space': 'cosine',
        },
      });
    } catch {
      // Collection might not exist, create it
      this.collection = await this.client.getOrCreateCollection({
        name: this.config.database,
        metadata: {
          description: 'IoT Refrigeration domain knowledge',
          'hnsw:space': 'cosine',
        },
      });
    }
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.client) {
        await this.connect();
      }
      await this.client!.heartbeat();
      return true;
    } catch {
      return false;
    }
  }
}

export default ChromaDBService;
