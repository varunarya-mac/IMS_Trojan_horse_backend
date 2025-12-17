/**
 * CSV Sampler Service
 * Intelligent sampling with anomaly preservation
 */

import type { CSVRow } from '../types.js';

/**
 * Sampling result
 */
export interface SampleResult {
  rows: CSVRow[];
  totalRows: number;
  sampleSize: number;
  samplingMethod: 'full' | 'systematic' | 'time_based' | 'anomaly_preserving';
  sampleRate: number;
}

/**
 * Sampler options
 */
export interface SamplerOptions {
  maxSamples?: number;
  timestampColumn?: string;
  preserveAnomalies?: boolean;
  anomalyBudget?: number; // Percentage of samples reserved for anomalies
}

/**
 * CSV Sampler Service with anomaly preservation
 */
export class CSVSamplerService {
  private readonly defaultMaxSamples = 10000;
  private readonly defaultAnomalyBudget = 0.1; // 10%

  /**
   * Sample data intelligently based on size and content
   */
  sample(rows: CSVRow[], options: SamplerOptions = {}): SampleResult {
    const {
      maxSamples = this.defaultMaxSamples,
      timestampColumn,
      preserveAnomalies = true,
      anomalyBudget = this.defaultAnomalyBudget,
    } = options;

    const totalRows = rows.length;

    // No sampling needed if data is small enough
    if (totalRows <= maxSamples) {
      return {
        rows,
        totalRows,
        sampleSize: totalRows,
        samplingMethod: 'full',
        sampleRate: 1,
      };
    }

    // Use anomaly-preserving sampling if enabled
    if (preserveAnomalies) {
      return this.anomalyPreservingSample(rows, maxSamples, timestampColumn, anomalyBudget);
    }

    // Use time-based sampling if timestamp column is available
    if (timestampColumn) {
      return this.timeBasedSample(rows, maxSamples, timestampColumn);
    }

    // Fall back to systematic sampling
    return this.systematicSample(rows, maxSamples);
  }

  /**
   * Anomaly-preserving sampling
   * Reserves a portion of samples for detected anomalies
   */
  private anomalyPreservingSample(
    rows: CSVRow[],
    maxSamples: number,
    timestampColumn?: string,
    anomalyBudget: number = 0.1
  ): SampleResult {
    const totalRows = rows.length;

    // Reserve samples for anomalies
    const anomalySampleCount = Math.floor(maxSamples * anomalyBudget);
    const regularSampleCount = maxSamples - anomalySampleCount;

    // First, detect anomalies
    const anomalyIndices = this.detectAnomalies(rows);
    const usedIndices = new Set<number>();

    // Get anomaly samples (top anomalies by score)
    const anomalyRows: CSVRow[] = [];
    for (let i = 0; i < Math.min(anomalySampleCount, anomalyIndices.length); i++) {
      const idx = anomalyIndices[i].index;
      anomalyRows.push(rows[idx]);
      usedIndices.add(idx);
    }

    // Get regular samples using time-based or systematic sampling
    let regularRows: CSVRow[];
    if (timestampColumn) {
      regularRows = this.timeBasedSampleExcluding(rows, regularSampleCount, timestampColumn, usedIndices);
    } else {
      regularRows = this.systematicSampleExcluding(rows, regularSampleCount, usedIndices);
    }

    // Combine and sort by original order if possible
    const sampled = [...regularRows, ...anomalyRows];

    return {
      rows: sampled,
      totalRows,
      sampleSize: sampled.length,
      samplingMethod: 'anomaly_preserving',
      sampleRate: sampled.length / totalRows,
    };
  }

  /**
   * Detect anomalies using Z-score
   */
  private detectAnomalies(rows: CSVRow[]): Array<{ index: number; score: number }> {
    if (rows.length === 0) return [];

    // Find numeric columns
    const numericColumns = Object.keys(rows[0]).filter(col => {
      const values = rows.slice(0, 100).map(r => parseFloat(r[col]));
      return values.filter(v => !isNaN(v)).length > 80;
    });

    if (numericColumns.length === 0) return [];

    // Calculate mean and std for each column
    const stats = new Map<string, { mean: number; std: number }>();
    for (const col of numericColumns) {
      const values = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
      if (values.length === 0) continue;

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance);

      if (std > 0) {
        stats.set(col, { mean, std });
      }
    }

    // Score each row by combined Z-score
    const scoredRows = rows.map((row, index) => {
      let totalZScore = 0;
      let count = 0;

      for (const col of numericColumns) {
        const stat = stats.get(col);
        if (!stat) continue;

        const value = parseFloat(row[col]);
        if (isNaN(value)) continue;

        const zScore = Math.abs(value - stat.mean) / stat.std;
        totalZScore += zScore;
        count++;
      }

      return {
        index,
        score: count > 0 ? totalZScore / count : 0,
      };
    });

    // Return rows with Z-score > 3 (significant outliers), sorted by score
    return scoredRows
      .filter(r => r.score > 3)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Systematic sampling
   */
  private systematicSample(rows: CSVRow[], maxSamples: number): SampleResult {
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
   * Systematic sampling excluding certain indices
   */
  private systematicSampleExcluding(
    rows: CSVRow[],
    maxSamples: number,
    excludeIndices: Set<number>
  ): CSVRow[] {
    const availableRows = rows.filter((_, i) => !excludeIndices.has(i));
    const step = Math.ceil(availableRows.length / maxSamples);
    const sampled: CSVRow[] = [];

    for (let i = 0; i < availableRows.length && sampled.length < maxSamples; i += step) {
      sampled.push(availableRows[i]);
    }

    return sampled;
  }

  /**
   * Time-based sampling
   */
  private timeBasedSample(
    rows: CSVRow[],
    maxSamples: number,
    timestampColumn: string
  ): SampleResult {
    const totalRows = rows.length;

    // Parse and sort by timestamp
    const rowsWithTime = rows
      .map((row, index) => ({
        row,
        index,
        timestamp: new Date(row[timestampColumn] || 0).getTime(),
      }))
      .filter(r => !isNaN(r.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (rowsWithTime.length === 0) {
      return this.systematicSample(rows, maxSamples);
    }

    // Sample evenly across time range
    const step = Math.ceil(rowsWithTime.length / maxSamples);
    const sampled: CSVRow[] = [];

    for (let i = 0; i < rowsWithTime.length && sampled.length < maxSamples; i += step) {
      sampled.push(rowsWithTime[i].row);
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
   * Time-based sampling excluding certain indices
   */
  private timeBasedSampleExcluding(
    rows: CSVRow[],
    maxSamples: number,
    timestampColumn: string,
    excludeIndices: Set<number>
  ): CSVRow[] {
    const rowsWithTime = rows
      .map((row, index) => ({
        row,
        index,
        timestamp: new Date(row[timestampColumn] || 0).getTime(),
      }))
      .filter(r => !isNaN(r.timestamp) && !excludeIndices.has(r.index))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (rowsWithTime.length === 0) {
      return this.systematicSampleExcluding(rows, maxSamples, excludeIndices);
    }

    const step = Math.ceil(rowsWithTime.length / maxSamples);
    const sampled: CSVRow[] = [];

    for (let i = 0; i < rowsWithTime.length && sampled.length < maxSamples; i += step) {
      sampled.push(rowsWithTime[i].row);
    }

    return sampled;
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
