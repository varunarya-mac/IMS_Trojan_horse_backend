/**
 * Embedding Service
 * Generates embeddings using OpenAI text-embedding-3-small
 */

import OpenAI from 'openai';
import type { EmbeddingConfig } from '../types.js';

/**
 * Embedding Service for generating vector embeddings
 */
export class EmbeddingService {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: EmbeddingConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
    this.model = config.model;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });

    return response.data[0].embedding;
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // OpenAI supports batching up to 2048 inputs
    const batchSize = 100;
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
      });

      for (const item of response.data) {
        embeddings.push(item.embedding);
      }
    }

    return embeddings;
  }

  /**
   * Get embedding dimension for the model
   */
  getEmbeddingDimension(): number {
    // text-embedding-3-small has 1536 dimensions
    return 1536;
  }

  /**
   * Check if the embedding service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try generating a simple embedding
      await this.generateEmbedding('test');
      return true;
    } catch {
      return false;
    }
  }
}

export default EmbeddingService;
