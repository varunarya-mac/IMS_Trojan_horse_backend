/**
 * Analysis prompt templates
 */

import type { CSVDataForAnalysis } from '../types.js';

/**
 * Build the user prompt for analysis
 */
export function buildAnalysisPrompt(
  userQuestion: string,
  csvData: CSVDataForAnalysis
): string {
  const parts: string[] = [];

  // Add CSV context
  parts.push('## CSV Data Context\n');
  parts.push(csvData.summary);
  parts.push('\n');

  // Add metadata details
  if (csvData.metadata) {
    parts.push('### Data Details\n');
    parts.push(`- File: ${csvData.metadata.fileName}`);
    parts.push(`- Rows: ${csvData.metadata.rowCount}`);
    parts.push(`- Columns: ${csvData.metadata.columnCount}`);

    if (csvData.metadata.timeRange) {
      parts.push(`- Time Range: ${csvData.metadata.timeRange.start} to ${csvData.metadata.timeRange.end}`);
      parts.push(`- Duration: ${csvData.metadata.timeRange.durationHours} hours`);
    }

    if (csvData.metadata.deviceType) {
      parts.push(`- Device Type: ${csvData.metadata.deviceType}`);
    }

    if (csvData.metadata.storeInfo) {
      const storeInfo = csvData.metadata.storeInfo;
      if (storeInfo.storeName || storeInfo.storeId) {
        parts.push(`- Store: ${storeInfo.storeName || storeInfo.storeId}`);
      }
    }
    parts.push('\n');
  }

  // Add statistics summary
  if (csvData.statistics && csvData.statistics.length > 0) {
    parts.push('### Key Statistics\n');
    const tempStats = csvData.statistics.filter(s =>
      s.column.toLowerCase().includes('temp') ||
      s.column.toLowerCase().includes('air_on') ||
      s.column.toLowerCase().includes('air_off')
    );

    for (const stat of tempStats.slice(0, 5)) {
      if (stat.type === 'numeric' && stat.min !== undefined) {
        parts.push(`- ${stat.column}: min=${stat.min.toFixed(2)}, max=${stat.max?.toFixed(2)}, mean=${stat.mean?.toFixed(2)}`);
      }
    }
    parts.push('\n');
  }

  // Add anomalies if present
  if (csvData.anomalies && csvData.anomalies.length > 0) {
    parts.push('### Detected Anomalies\n');
    for (const anomaly of csvData.anomalies.slice(0, 10)) {
      parts.push(`- ${anomaly.column}: ${anomaly.description}`);
    }
    parts.push('\n');
  }

  // Add sample data if present (limited)
  if (csvData.sampleData && csvData.sampleData.length > 0) {
    parts.push('### Sample Data (first 5 rows)\n');
    parts.push('```');
    const headers = Object.keys(csvData.sampleData[0]);
    parts.push(headers.join(' | '));
    parts.push('-'.repeat(headers.length * 15));
    for (const row of csvData.sampleData.slice(0, 5)) {
      parts.push(headers.map(h => row[h] || '').join(' | '));
    }
    parts.push('```\n');
  }

  // Add user question
  parts.push('## User Question\n');
  parts.push(userQuestion);
  parts.push('\n');

  // Add response instructions
  parts.push('## Instructions\n');
  parts.push('Please analyze the refrigeration data above and answer the user\'s question.');
  parts.push('Provide specific insights based on the actual data values.');
  parts.push('Include recommendations where applicable.');
  parts.push('If a graph would help visualize the answer, suggest what type of graph and which columns to use.');

  return parts.join('\n');
}

/**
 * Build prompt for extracting structured summary
 */
export function buildSummaryExtractionPrompt(analysisContent: string): string {
  return `Based on this analysis, extract a structured summary.

Analysis:
${analysisContent}

Respond with JSON:
{
  "summary": "2-3 sentence summary of key findings",
  "recommendations": [
    {
      "title": "Short title",
      "description": "Detailed recommendation",
      "priority": "high|medium|low",
      "category": "temperature|maintenance|efficiency|safety"
    }
  ],
  "datapoints": [
    {
      "label": "Metric name",
      "value": "numeric or string value",
      "unit": "optional unit",
      "trend": "up|down|stable (optional)"
    }
  ],
  "graphRecommendation": {
    "type": "line|bar|scatter",
    "title": "Graph title",
    "xColumn": "timestamp column",
    "yColumns": ["column1", "column2"],
    "reason": "Why this graph helps"
  } or null
}`;
}

/**
 * Build semantic check prompt
 */
export function buildSemanticCheckPrompt(userQuestion: string): string {
  return `Evaluate if this question is related to refrigeration systems or cold chain data analysis:

Question: "${userQuestion}"

Consider:
1. Is this about refrigeration equipment, temperature, or cold chain?
2. Is this asking to analyze telemetry/sensor data?
3. Is this a reasonable follow-up in a refrigeration data analysis context?

Respond with JSON only.`;
}
