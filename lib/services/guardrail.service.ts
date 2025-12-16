/**
 * Guardrail Service
 * Layer 1 keyword-based content filtering for refrigeration-related questions
 */

import {
  REFRIGERATION_KEYWORDS,
  BLOCKED_PATTERNS,
  ALLOWED_GENERIC_PATTERNS,
  REFRIGERATION_COLUMNS,
} from '../constants/refrigeration.js';
import type { GuardrailCheckResult } from '../types/analysis.types.js';

/**
 * Guardrail service for content filtering
 */
export class GuardrailService {
  /**
   * Check if a question is allowed (Layer 1 - keyword-based)
   */
  checkQuestion(question: string): GuardrailCheckResult {
    const normalizedQuestion = question.toLowerCase().trim();

    // Check for blocked patterns first (non-refrigeration topics)
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(normalizedQuestion)) {
        return {
          allowed: false,
          rejectionReason: 'This question does not appear to be related to refrigeration systems.',
          suggestion: 'I can help with questions about refrigeration equipment, temperature monitoring, alarm patterns, or troubleshooting. For example: "Why is my case refrigerator showing temperature drift?" or "Explain the defrost cycle pattern in my data."',
        };
      }
    }

    // Check for refrigeration keywords
    const matchedKeywords: string[] = [];
    for (const keyword of REFRIGERATION_KEYWORDS) {
      if (normalizedQuestion.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    // If we have matched keywords, allow the question
    if (matchedKeywords.length > 0) {
      return {
        allowed: true,
        matchedKeywords,
      };
    }

    // Check if it's a generic question that should be allowed
    const isGenericAllowed = ALLOWED_GENERIC_PATTERNS.some(pattern =>
      pattern.test(question)
    );

    if (isGenericAllowed) {
      // Allow but note uncertainty - Layer 2 will handle semantic check
      return {
        allowed: true,
        matchedKeywords: [],
      };
    }

    // No keywords matched and not a generic allowed pattern
    return {
      allowed: false,
      rejectionReason: 'I could not identify refrigeration-related content in your question.',
      suggestion: 'Please ask questions related to refrigeration systems, temperature monitoring, alarms, or cold chain management. If you have a CSV file with refrigeration data, you can upload it and ask questions about it.',
    };
  }

  /**
   * Check if CSV columns indicate refrigeration data
   */
  checkCSVColumns(columns: string[]): GuardrailCheckResult {
    const normalizedColumns = columns.map(col => col.toLowerCase().trim());

    // Count how many columns match refrigeration columns
    const matchedColumns = normalizedColumns.filter(col =>
      REFRIGERATION_COLUMNS.some(refCol =>
        col === refCol.toLowerCase() || col.includes(refCol.toLowerCase())
      )
    );

    // Require at least 3 refrigeration columns
    if (matchedColumns.length < 3) {
      return {
        allowed: false,
        csvRejection: {
          reason: 'This CSV does not appear to contain refrigeration telemetry data.',
          detectedColumns: columns.slice(0, 10),
          suggestion: 'Please upload a CSV with refrigeration data columns such as timestamp, air_on_temperature, air_off_temperature, state_case, etc.',
        },
      };
    }

    // Check for timestamp column
    const hasTimestamp = normalizedColumns.some(col =>
      col === 'timestamp' ||
      col.includes('time') ||
      col.includes('date')
    );

    if (!hasTimestamp) {
      return {
        allowed: false,
        csvRejection: {
          reason: 'CSV must contain a timestamp column.',
          detectedColumns: columns.slice(0, 10),
          suggestion: 'Please ensure your CSV has a timestamp, time, or date column.',
        },
      };
    }

    return {
      allowed: true,
      matchedKeywords: matchedColumns,
    };
  }

  /**
   * Quick check if question needs Layer 2 semantic analysis
   */
  needsSemanticCheck(question: string): boolean {
    const result = this.checkQuestion(question);

    // If allowed but no keywords matched, needs Layer 2 check
    if (result.allowed && (!result.matchedKeywords || result.matchedKeywords.length === 0)) {
      return true;
    }

    return false;
  }

  /**
   * Get all refrigeration keywords for reference
   */
  getRefrigerationKeywords(): readonly string[] {
    return REFRIGERATION_KEYWORDS;
  }

  /**
   * Get all refrigeration column names for reference
   */
  getRefrigerationColumns(): readonly string[] {
    return REFRIGERATION_COLUMNS;
  }
}

export default GuardrailService;
