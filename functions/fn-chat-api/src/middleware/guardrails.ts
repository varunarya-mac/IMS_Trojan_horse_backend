/**
 * Guardrails Middleware
 * Layer 1 keyword-based content filtering for fn-chat-api
 */

import { GuardrailService } from '@lib/services/guardrail.service.js';
import { GuardrailError } from '@lib/utils/errors.js';
import type { GuardrailCheckResult } from '@lib/types/analysis.types.js';

const guardrailService = new GuardrailService();

/**
 * Check if a question is allowed before processing
 * Throws GuardrailError if question is rejected
 */
export function checkQuestionGuardrail(question: string): GuardrailCheckResult {
  const result = guardrailService.checkQuestion(question);

  if (!result.allowed) {
    throw new GuardrailError(
      result.rejectionReason || 'Question not related to refrigeration systems',
      {
        suggestion: result.suggestion,
        matchedKeywords: result.matchedKeywords,
      }
    );
  }

  return result;
}

/**
 * Check if CSV columns indicate refrigeration data
 * Throws GuardrailError if CSV is rejected
 */
export function checkCSVGuardrail(columns: string[]): GuardrailCheckResult {
  const result = guardrailService.checkCSVColumns(columns);

  if (!result.allowed && result.csvRejection) {
    throw new GuardrailError(
      result.csvRejection.reason,
      {
        suggestion: result.csvRejection.suggestion,
        detectedColumns: result.csvRejection.detectedColumns,
      }
    );
  }

  return result;
}

/**
 * Check if question needs Layer 2 semantic analysis
 */
export function needsSemanticCheck(question: string): boolean {
  return guardrailService.needsSemanticCheck(question);
}

/**
 * Get guardrail service instance for direct access
 */
export function getGuardrailService(): GuardrailService {
  return guardrailService;
}
