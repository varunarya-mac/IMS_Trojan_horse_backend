/**
 * Guardrail Service (Layer 2)
 * Semantic content filtering using AI
 */

import { OpenAIService } from './openai.service.js';
import { SEMANTIC_CHECK_PROMPT } from '../prompts/system.prompt.js';
import type { SemanticCheckResult } from '../types.js';

/**
 * Layer 2 Guardrail Service
 * Uses AI for semantic content filtering
 */
export class GuardrailService {
  private readonly openai: OpenAIService;
  private readonly confidenceThreshold: number = 0.7;

  constructor(openai: OpenAIService) {
    this.openai = openai;
  }

  /**
   * Perform semantic check on user question
   */
  async checkQuestion(userQuestion: string): Promise<SemanticCheckResult> {
    const prompt = `User question: "${userQuestion}"\n\nIs this question related to refrigeration systems or cold chain management?`;

    const result = await this.openai.semanticCheck(SEMANTIC_CHECK_PROMPT, prompt);

    return {
      allowed: result.allowed && result.confidence >= this.confidenceThreshold,
      confidence: result.confidence,
      reason: result.reason,
      suggestion: result.suggestion,
    };
  }

  /**
   * Validate analysis output before returning
   */
  validateOutput(analysisContent: string): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check if response is too short
    if (analysisContent.length < 100) {
      issues.push('Response is unusually short');
    }

    // Check for refusal patterns
    const refusalPatterns = [
      "I can't",
      "I cannot",
      "I'm not able",
      "I won't",
      "outside my scope",
      "not related to refrigeration",
    ];

    for (const pattern of refusalPatterns) {
      if (analysisContent.toLowerCase().includes(pattern.toLowerCase())) {
        issues.push(`Response contains potential refusal: "${pattern}"`);
      }
    }

    // Check for hallucination indicators
    const hallucIndicators = [
      "I don't have access to",
      "I cannot see",
      "no data provided",
      "without the actual data",
    ];

    for (const indicator of hallucIndicators) {
      if (analysisContent.toLowerCase().includes(indicator.toLowerCase())) {
        issues.push(`Response may indicate missing context: "${indicator}"`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Sanitize user input before sending to AI
   */
  sanitizeInput(input: string): string {
    let sanitized = input;

    // Remove potential prompt injection patterns
    const injectionPatterns = [
      /ignore previous instructions/gi,
      /disregard all previous/gi,
      /you are now/gi,
      /new instructions:/gi,
      /system:/gi,
      /\[SYSTEM\]/gi,
    ];

    for (const pattern of injectionPatterns) {
      sanitized = sanitized.replace(pattern, '');
    }

    // Truncate very long inputs
    if (sanitized.length > 5000) {
      sanitized = sanitized.substring(0, 5000) + '... (truncated)';
    }

    return sanitized.trim();
  }
}

export default GuardrailService;
