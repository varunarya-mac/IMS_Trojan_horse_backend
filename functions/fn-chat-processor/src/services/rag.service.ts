/**
 * RAG Service
 * Calls fn-vector-search for domain knowledge retrieval
 */

import { Client, Functions, ExecutionMethod } from 'node-appwrite';
import type { RAGResult } from '../types.js';

/**
 * RAG Service Configuration
 */
export interface RAGServiceConfig {
  functionId: string;
  endpoint: string;
  projectId: string;
  apiKey: string;
}

/**
 * RAG Service for vector search integration
 */
export class RAGService {
  private readonly client: Client;
  private readonly functions: Functions;
  private readonly functionId: string;

  constructor(config: RAGServiceConfig) {
    this.functionId = config.functionId;

    this.client = new Client()
      .setEndpoint(config.endpoint)
      .setProject(config.projectId)
      .setKey(config.apiKey);

    this.functions = new Functions(this.client);
  }

  /**
   * Search for relevant domain knowledge
   */
  async search(query: string, topK: number = 5, minScore: number = 0.5): Promise<RAGResult[]> {
    try {
      const execution = await this.functions.createExecution(
        this.functionId,
        JSON.stringify({
          action: 'search',
          query,
          topK,
          minScore,
        }),
        false, // async = false (synchronous)
        '/', // path
        ExecutionMethod.POST, // method
        { 'Content-Type': 'application/json' }
      );

      // Check execution status
      if (execution.status !== 'completed') {
        console.error('RAG search failed:', execution.responseStatusCode, execution.errors);
        return [];
      }

      // Parse response
      const response = JSON.parse(execution.responseBody);

      if (!response.success || !response.data?.results) {
        return [];
      }

      return response.data.results.map((result: {
        content: string;
        score: number;
        metadata?: { section?: string };
      }) => ({
        content: result.content,
        score: result.score,
        section: result.metadata?.section,
      }));
    } catch (error) {
      console.error('RAG search error:', error);
      return [];
    }
  }

  /**
   * Get context for AI prompt from RAG results
   */
  getContextForPrompt(results: RAGResult[]): string[] {
    // Return top results as context strings
    return results
      .filter(r => r.score >= 0.5)
      .slice(0, 3)
      .map(r => r.content);
  }

  /**
   * Get pre-computed document summary for fallback scenarios
   */
  async getSummary(): Promise<string | null> {
    try {
      const execution = await this.functions.createExecution(
        this.functionId,
        JSON.stringify({ action: 'get_summary' }),
        false,
        '/',
        ExecutionMethod.POST,
        { 'Content-Type': 'application/json' }
      );

      if (execution.status !== 'completed') {
        console.error('RAG getSummary failed:', execution.responseStatusCode, execution.errors);
        return null;
      }

      const response = JSON.parse(execution.responseBody);

      if (!response.success || !response.data?.found) {
        return null;
      }

      return response.data.summary;
    } catch (error) {
      console.error('RAG getSummary error:', error);
      return null;
    }
  }

  /**
   * Check if search results indicate low confidence (should use fallback)
   */
  shouldUseFallback(results: RAGResult[], minConfidenceScore: number = 0.6): boolean {
    if (results.length === 0) {
      return true;
    }

    // Check if the best result is below confidence threshold
    const bestScore = Math.max(...results.map(r => r.score));
    return bestScore < minConfidenceScore;
  }

  /**
   * Check if a question is generic/vague (should use summary)
   */
  isGenericQuestion(question: string): boolean {
    const genericPatterns = [
      /^(what|tell me|explain|describe|give me|provide).*(about|regarding|overview|summary|information|details)/i,
      /^(how does|what is).*(work|system|process)/i,
      /general\s+(information|overview|summary)/i,
      /^summarize/i,
      /^overview/i,
      /^explain.*(refrigeration|system|process)/i,
      /what.*should.*know/i,
      /introduction.*to/i,
    ];

    return genericPatterns.some(pattern => pattern.test(question.trim()));
  }

  /**
   * Check if RAG service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const execution = await this.functions.createExecution(
        this.functionId,
        JSON.stringify({ action: 'health' }),
        false,
        '/',
        ExecutionMethod.POST,
        { 'Content-Type': 'application/json' }
      );

      if (execution.status !== 'completed') {
        return false;
      }

      const response = JSON.parse(execution.responseBody);
      return response.success && response.data?.healthy;
    } catch {
      return false;
    }
  }
}

export default RAGService;
