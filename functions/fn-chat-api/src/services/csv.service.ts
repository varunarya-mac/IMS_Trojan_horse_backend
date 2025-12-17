/**
 * CSV Service
 * Lightweight CSV parsing for fn-chat-api context building
 */

import { parse } from 'csv-parse';
import { Readable } from 'stream';

/**
 * CSV row type
 */
export type CSVRow = Record<string, string>;

/**
 * Parse result
 */
export interface ParseResult {
  headers: string[];
  rows: CSVRow[];
  totalRows: number;
  wasTruncated: boolean;
}

/**
 * Sample result
 */
export interface SampleResult {
  rows: CSVRow[];
  totalRows: number;
  sampleSize: number;
  samplingMethod: 'full' | 'stratified' | 'anomaly_preserving';
  sampleRate: number;
}

/**
 * CSV Processor Service
 */
export class CSVProcessorService {
  async parse(
    content: string | Buffer,
    options: { maxRows?: number } = {}
  ): Promise<ParseResult> {
    const { maxRows = 50000 } = options;

    return new Promise((resolve, reject) => {
      const rows: CSVRow[] = [];
      let headers: string[] = [];
      let totalRows = 0;
      let wasTruncated = false;

      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        cast: false,
      });

      parser.on('readable', () => {
        let record;
        while ((record = parser.read()) !== null) {
          totalRows++;

          if (headers.length === 0 && record) {
            headers = Object.keys(record);
          }

          if (totalRows <= maxRows) {
            rows.push(record as CSVRow);
          } else if (!wasTruncated) {
            wasTruncated = true;
          }
        }
      });

      parser.on('error', (err: Error) => {
        reject(new Error(`CSV parsing error: ${err.message}`));
      });

      parser.on('end', () => {
        resolve({ headers, rows, totalRows, wasTruncated });
      });

      if (Buffer.isBuffer(content)) {
        const stream = Readable.from(content);
        stream.pipe(parser);
      } else {
        parser.write(content);
        parser.end();
      }
    });
  }
}

/**
 * CSV Sampler Service
 */
export class CSVSamplerService {
  sample(
    rows: CSVRow[],
    options: {
      maxSamples?: number;
      timestampColumn?: string;
      preserveAnomalies?: boolean;
      anomalyBudget?: number;
    } = {}
  ): SampleResult {
    const {
      maxSamples = 5000,
      timestampColumn,
      preserveAnomalies = true,
      anomalyBudget = 0.1,
    } = options;

    const totalRows = rows.length;

    if (totalRows <= maxSamples) {
      return {
        rows,
        totalRows,
        sampleSize: totalRows,
        samplingMethod: 'full',
        sampleRate: 1,
      };
    }

    // Use anomaly-preserving sampling
    if (preserveAnomalies) {
      return this.anomalyPreservingSample(rows, maxSamples, timestampColumn, anomalyBudget);
    }

    // Fall back to stratified sampling
    return this.stratifiedSample(rows, maxSamples);
  }

  private anomalyPreservingSample(
    rows: CSVRow[],
    maxSamples: number,
    timestampColumn?: string,
    anomalyBudget: number = 0.1
  ): SampleResult {
    const totalRows = rows.length;
    const anomalySampleCount = Math.floor(maxSamples * anomalyBudget);
    const regularSampleCount = maxSamples - anomalySampleCount;

    // Detect anomalies
    const anomalyIndices = this.detectAnomalies(rows);
    const usedIndices = new Set<number>();

    // Get anomaly samples
    const anomalyRows: CSVRow[] = [];
    for (let i = 0; i < Math.min(anomalySampleCount, anomalyIndices.length); i++) {
      const idx = anomalyIndices[i].index;
      anomalyRows.push(rows[idx]);
      usedIndices.add(idx);
    }

    // Get regular samples
    const availableRows = rows.filter((_, i) => !usedIndices.has(i));
    const step = Math.ceil(availableRows.length / regularSampleCount);
    const regularRows: CSVRow[] = [];

    for (let i = 0; i < availableRows.length && regularRows.length < regularSampleCount; i += step) {
      regularRows.push(availableRows[i]);
    }

    const sampled = [...regularRows, ...anomalyRows];

    return {
      rows: sampled,
      totalRows,
      sampleSize: sampled.length,
      samplingMethod: 'anomaly_preserving',
      sampleRate: sampled.length / totalRows,
    };
  }

  private detectAnomalies(rows: CSVRow[]): Array<{ index: number; score: number }> {
    if (rows.length === 0) return [];

    const numericColumns = Object.keys(rows[0]).filter(col => {
      const values = rows.slice(0, 100).map(r => parseFloat(r[col]));
      return values.filter(v => !isNaN(v)).length > 80;
    });

    if (numericColumns.length === 0) return [];

    const stats = new Map<string, { mean: number; std: number }>();
    for (const col of numericColumns) {
      const values = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
      if (values.length === 0) continue;

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance);

      if (std > 0) stats.set(col, { mean, std });
    }

    return rows
      .map((row, index) => {
        let totalZScore = 0;
        let count = 0;

        for (const col of numericColumns) {
          const stat = stats.get(col);
          if (!stat) continue;

          const value = parseFloat(row[col]);
          if (isNaN(value)) continue;

          totalZScore += Math.abs(value - stat.mean) / stat.std;
          count++;
        }

        return { index, score: count > 0 ? totalZScore / count : 0 };
      })
      .filter(r => r.score > 3)
      .sort((a, b) => b.score - a.score);
  }

  private stratifiedSample(rows: CSVRow[], maxSamples: number): SampleResult {
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
      samplingMethod: 'stratified',
      sampleRate: sampled.length / totalRows,
    };
  }

  getRecommendedSampleSize(rowCount: number, fileSizeBytes: number): number {
    const sizeMB = fileSizeBytes / (1024 * 1024);

    if (sizeMB < 1) return Math.min(rowCount, 10000);
    if (sizeMB < 5) return Math.min(rowCount, 5000);
    if (sizeMB < 10) return Math.min(rowCount, 3000);
    if (sizeMB < 25) return Math.min(rowCount, 2000);
    return Math.min(rowCount, 1000);
  }
}
