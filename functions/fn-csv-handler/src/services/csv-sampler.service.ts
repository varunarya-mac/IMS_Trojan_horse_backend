/**
 * CSV Sampler Service
 * Intelligent sampling for large CSV files
 */

import type { CSVRow } from '../types.js';

/**
 * Sampling result
 */
export interface SampleResult {
  rows: CSVRow[];
  totalRows: number;
  sampleSize: number;
  samplingMethod: 'none' | 'systematic' | 'stratified' | 'time_based';
  sampleRate: number;
}

/**
 * Sampler options
 */
export interface SamplerOptions {
  maxSamples?: number;
  timestampColumn?: string;
  preserveAnomalies?: boolean;
  stratifyColumn?: string;
}

/**
 * CSV Sampler Service
 */
export class CSVSamplerService {
  private readonly defaultMaxSamples = 10000;

  /**
   * Sample data intelligently based on size and content
   */
  sample(
    rows: CSVRow[],
    options: SamplerOptions = {}
  ): SampleResult {
    const {
      maxSamples = this.defaultMaxSamples,
      timestampColumn,
      preserveAnomalies = true,
    } = options;

    const totalRows = rows.length;

    // No sampling needed if data is small enough
    if (totalRows <= maxSamples) {
      return {
        rows,
        totalRows,
        sampleSize: totalRows,
        samplingMethod: 'none',
        sampleRate: 1,
      };
    }

    // Use time-based sampling if timestamp column is available
    if (timestampColumn) {
      return this.timeBased(rows, maxSamples, timestampColumn, preserveAnomalies);
    }

    // Fall back to systematic sampling
    return this.systematic(rows, maxSamples);
  }

  /**
   * Systematic sampling - take every nth row
   */
  systematic(rows: CSVRow[], maxSamples: number): SampleResult {
    const totalRows = rows.length;
    const step = Math.ceil(totalRows / maxSamples);
    const sampled: CSVRow[] = [];

    for (let i = 0; i < totalRows && sampled.length < maxSamples; i += step) {
      sampled.push(rows[i]);
    }

    return {
      rows: sampled,
      totalRows,
      sampleSize: sampled.length,
      samplingMethod: 'systematic',
      sampleRate: sampled.length / totalRows,
    };
  }

  /**
   * Time-based sampling - preserve time distribution
   */
  timeBased(
    rows: CSVRow[],
    maxSamples: number,
    timestampColumn: string,
    preserveAnomalies: boolean
  ): SampleResult {
    const totalRows = rows.length;

    // Parse timestamps and sort
    const rowsWithTime = rows
      .map((row, index) => ({
        row,
        index,
        timestamp: new Date(row[timestampColumn] || 0).getTime(),
      }))
      .filter(r => !isNaN(r.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (rowsWithTime.length === 0) {
      return this.systematic(rows, maxSamples);
    }

    // Calculate time range
    const startTime = rowsWithTime[0].timestamp;
    const endTime = rowsWithTime[rowsWithTime.length - 1].timestamp;
    const timeRange = endTime - startTime;

    if (timeRange === 0) {
      return this.systematic(rows, maxSamples);
    }

    // Reserve some samples for anomalies if requested
    const anomalySampleCount = preserveAnomalies ? Math.floor(maxSamples * 0.1) : 0;
    const regularSampleCount = maxSamples - anomalySampleCount;

    // Calculate bucket size for regular sampling
    const bucketCount = regularSampleCount;
    const bucketSize = timeRange / bucketCount;

    const sampled: CSVRow[] = [];
    const usedIndices = new Set<number>();
    let currentBucket = 0;

    for (const { row, index, timestamp } of rowsWithTime) {
      const bucket = Math.floor((timestamp - startTime) / bucketSize);

      if (bucket !== currentBucket || sampled.length === 0) {
        if (sampled.length < regularSampleCount) {
          sampled.push(row);
          usedIndices.add(index);
          currentBucket = bucket;
        }
      }
    }

    // Add anomalies if requested
    if (preserveAnomalies && anomalySampleCount > 0) {
      const anomalies = this.detectAnomalyRows(rows, usedIndices);
      const anomaliesToAdd = anomalies.slice(0, anomalySampleCount);
      sampled.push(...anomaliesToAdd);
    }

    return {
      rows: sampled,
      totalRows,
      sampleSize: sampled.length,
      samplingMethod: 'time_based',
      sampleRate: sampled.length / totalRows,
    };
  }

  /**
   * Stratified sampling - sample proportionally from groups
   */
  stratified(
    rows: CSVRow[],
    maxSamples: number,
    stratifyColumn: string
  ): SampleResult {
    const totalRows = rows.length;

    // Group by stratify column
    const groups = new Map<string, CSVRow[]>();
    for (const row of rows) {
      const key = row[stratifyColumn] || '__null__';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(row);
    }

    // Calculate samples per group
    const sampled: CSVRow[] = [];
    const totalGroups = groups.size;
    const samplesPerGroup = Math.floor(maxSamples / totalGroups);

    for (const [, groupRows] of groups) {
      const groupSamples = Math.min(samplesPerGroup, groupRows.length);
      const step = Math.ceil(groupRows.length / groupSamples);

      for (let i = 0; i < groupRows.length && sampled.length < maxSamples; i += step) {
        sampled.push(groupRows[i]);
      }
    }

    return {
      rows: sampled,
      totalRows,
      sampleSize: sampled.length,
      samplingMethod: 'stratified',
      sampleRate: sampled.length / totalRows,
    };
  }

  /**
   * Detect rows that might be anomalies based on numeric columns
   */
  private detectAnomalyRows(rows: CSVRow[], excludeIndices: Set<number>): CSVRow[] {
    if (rows.length === 0) return [];

    // Find numeric columns
    const numericColumns = Object.keys(rows[0]).filter(col => {
      const values = rows.slice(0, 100).map(r => parseFloat(r[col]));
      return values.filter(v => !isNaN(v)).length > 80;
    });

    if (numericColumns.length === 0) return [];

    // Calculate mean and std for each numeric column
    const stats = new Map<string, { mean: number; std: number }>();
    for (const col of numericColumns) {
      const values = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance);
      stats.set(col, { mean, std });
    }

    // Score rows by how far they are from mean
    const scoredRows = rows
      .map((row, index) => {
        if (excludeIndices.has(index)) {
          return { row, score: 0 };
        }

        let score = 0;
        for (const col of numericColumns) {
          const value = parseFloat(row[col]);
          if (isNaN(value)) continue;

          const { mean, std } = stats.get(col)!;
          if (std > 0) {
            score += Math.abs(value - mean) / std;
          }
        }
        return { row, score };
      })
      .filter(r => r.score > 0);

    // Return top anomalies
    return scoredRows
      .sort((a, b) => b.score - a.score)
      .map(r => r.row);
  }

  /**
   * Get recommended sample size based on file size
   */
  getRecommendedSampleSize(rowCount: number, fileSizeBytes: number): number {
    const sizeMB = fileSizeBytes / (1024 * 1024);

    if (sizeMB < 1) return Math.min(rowCount, 10000);
    if (sizeMB < 5) return Math.min(rowCount, 5000);
    if (sizeMB < 10) return Math.min(rowCount, 3000);
    if (sizeMB < 25) return Math.min(rowCount, 2000);
    return Math.min(rowCount, 1000);
  }
}

export default CSVSamplerService;
