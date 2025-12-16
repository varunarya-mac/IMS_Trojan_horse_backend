/**
 * OpenAI Service
 * Handles communication with OpenAI API
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/**
 * OpenAI response type
 */
export interface OpenAIResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * OpenAI Service for AI analysis
 */
export class OpenAIService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly guardrailModel: string;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL || 'gpt-4o';
    this.guardrailModel = process.env.OPENAI_GUARDRAIL_MODEL || 'gpt-4o-mini';
  }

  /**
   * Send a chat completion request
   */
  async chat(
    messages: ChatCompletionMessageParam[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      responseFormat?: 'text' | 'json_object';
    } = {}
  ): Promise<OpenAIResponse> {
    const {
      model = this.model,
      temperature = 0.7,
      maxTokens = 4096,
      responseFormat = 'text',
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
        });

        const content = response.choices[0]?.message?.content || '';
        const usage = response.usage;

        return {
          content,
          usage: {
            promptTokens: usage?.prompt_tokens || 0,
            completionTokens: usage?.completion_tokens || 0,
            totalTokens: usage?.total_tokens || 0,
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (this.isRetryableError(error)) {
          if (attempt < this.maxRetries) {
            await this.sleep(this.retryDelay * attempt);
            continue;
          }
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Analyze refrigeration data
   */
  async analyzeData(
    systemPrompt: string,
    userPrompt: string
  ): Promise<OpenAIResponse> {
    return this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        model: this.model,
        temperature: 0.7,
        maxTokens: 4096,
      }
    );
  }

  /**
   * Extract structured data from analysis
   */
  async extractStructuredData<T>(
    prompt: string,
    schema: string
  ): Promise<T> {
    const response = await this.chat(
      [
        {
          role: 'system',
          content: `You are a JSON extraction assistant. Extract structured data from the provided text and respond with valid JSON only. Schema: ${schema}`,
        },
        { role: 'user', content: prompt },
      ],
      {
        model: this.guardrailModel, // Use faster model for extraction
        temperature: 0,
        maxTokens: 2048,
        responseFormat: 'json_object',
      }
    );

    try {
      return JSON.parse(response.content) as T;
    } catch {
      throw new Error('Failed to parse JSON response from OpenAI');
    }
  }

  /**
   * Perform semantic check (Layer 2 guardrail)
   */
  async semanticCheck(
    systemPrompt: string,
    userQuestion: string
  ): Promise<{ allowed: boolean; confidence: number; reason?: string; suggestion?: string }> {
    const response = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userQuestion },
      ],
      {
        model: this.guardrailModel,
        temperature: 0,
        maxTokens: 256,
        responseFormat: 'json_object',
      }
    );

    try {
      return JSON.parse(response.content);
    } catch {
      // If JSON parsing fails, assume allowed with low confidence
      return {
        allowed: true,
        confidence: 0.5,
        reason: 'Could not parse guardrail response',
      };
    }
  }

  /**
   * Get graph recommendation
   */
  async getGraphRecommendation(
    csvSummary: string,
    userQuestion: string
  ): Promise<{
    type: 'line' | 'bar' | 'scatter';
    title: string;
    xColumn: string;
    yColumns: string[];
    reason: string;
  } | null> {
    const response = await this.chat(
      [
        {
          role: 'system',
          content: `You recommend graph visualizations for refrigeration data. Respond with JSON: {"type": "line|bar|scatter", "title": "string", "xColumn": "string", "yColumns": ["string"], "reason": "string"} or null if no graph needed.`,
        },
        {
          role: 'user',
          content: `CSV Summary:\n${csvSummary}\n\nUser Question: ${userQuestion}\n\nShould a graph be generated? If yes, what type?`,
        },
      ],
      {
        model: this.guardrailModel,
        temperature: 0,
        maxTokens: 256,
        responseFormat: 'json_object',
      }
    );

    try {
      const result = JSON.parse(response.content);
      if (result && result.type) {
        return result;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof OpenAI.APIError) {
      // Retry on rate limits and server errors
      return error.status === 429 || (error.status >= 500 && error.status < 600);
    }
    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current model names
   */
  getModelInfo(): { analysisModel: string; guardrailModel: string } {
    return {
      analysisModel: this.model,
      guardrailModel: this.guardrailModel,
    };
  }
}

export default OpenAIService;
