/**
 * CSV Processor Service
 * Parses and processes CSV data for analysis
 */

import { parse } from 'csv-parse';
import { Readable } from 'stream';
import type { CSVRow } from '../types.js';

/**
 * Parse result with headers and rows
 */
export interface ParseResult {
  headers: string[];
  rows: CSVRow[];
  totalRows: number;
  wasTruncated: boolean;
}

/**
 * CSV Processor Service
 */
export class CSVProcessorService {
  /**
   * Parse CSV content
   */
  async parse(
    content: string | Buffer,
    options: {
      maxRows?: number;
      skipEmptyLines?: boolean;
      trimValues?: boolean;
    } = {}
  ): Promise<ParseResult> {
    const { maxRows = 50000, skipEmptyLines = true, trimValues = true } = options;

    return new Promise((resolve, reject) => {
      const rows: CSVRow[] = [];
      let headers: string[] = [];
      let totalRows = 0;
      let wasTruncated = false;

      const parser = parse({
        columns: true,
        skip_empty_lines: skipEmptyLines,
        trim: trimValues,
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

      parser.on('error', (err) => {
        reject(new Error(`CSV parsing error: ${err.message}`));
      });

      parser.on('end', () => {
        resolve({
          headers,
          rows,
          totalRows,
          wasTruncated,
        });
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

  /**
   * Parse only headers
   */
  async parseHeaders(content: string | Buffer): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: false,
        to: 1,
        trim: true,
      });

      const headers: string[] = [];

      parser.on('readable', () => {
        let record;
        while ((record = parser.read()) !== null) {
          headers.push(...record);
        }
      });

      parser.on('error', (err) => {
        reject(new Error(`CSV header parsing error: ${err.message}`));
      });

      parser.on('end', () => {
        resolve(headers);
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

  /**
   * Extract specific columns
   */
  async parseColumns(
    content: string | Buffer,
    columns: string[],
    options: { maxRows?: number } = {}
  ): Promise<ParseResult> {
    const { maxRows = 50000 } = options;
    const fullResult = await this.parse(content, { maxRows });

    const filteredRows = fullResult.rows.map(row => {
      const filtered: CSVRow = {};
      for (const col of columns) {
        if (col in row) {
          filtered[col] = row[col];
        }
      }
      return filtered;
    });

    return {
      headers: columns.filter(c => fullResult.headers.includes(c)),
      rows: filteredRows,
      totalRows: fullResult.totalRows,
      wasTruncated: fullResult.wasTruncated,
    };
  }

  /**
   * Calculate column statistics
   */
  calculateColumnStats(headers: string[], rows: CSVRow[]): Array<{
    column: string;
    type: 'numeric' | 'string' | 'datetime';
    min?: number;
    max?: number;
    mean?: number;
    nullCount: number;
    uniqueCount: number;
  }> {
    const stats = [];

    for (const column of headers) {
      const values = rows.map(r => r[column]);
      const nonNullValues = values.filter(v => v !== '' && v !== null && v !== undefined);
      const numericValues = nonNullValues.map(v => parseFloat(v)).filter(v => !isNaN(v));

      const isNumeric = numericValues.length > nonNullValues.length * 0.8;
      const uniqueValues = new Set(nonNullValues);

      if (isNumeric && numericValues.length > 0) {
        stats.push({
          column,
          type: 'numeric' as const,
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          mean: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
          nullCount: values.length - nonNullValues.length,
          uniqueCount: uniqueValues.size,
        });
      } else {
        // Check if datetime
        const isDateTime = nonNullValues.slice(0, 10).some(v => {
          const date = new Date(v);
          return !isNaN(date.getTime());
        });

        stats.push({
          column,
          type: isDateTime ? ('datetime' as const) : ('string' as const),
          nullCount: values.length - nonNullValues.length,
          uniqueCount: uniqueValues.size,
        });
      }
    }

    return stats;
  }

  /**
   * Create summary for AI analysis
   */
  createSummaryForAI(
    headers: string[],
    rows: CSVRow[],
    stats: ReturnType<typeof this.calculateColumnStats>
  ): string {
    const lines: string[] = [];

    lines.push(`CSV Data Summary:`);
    lines.push(`- Total rows: ${rows.length}`);
    lines.push(`- Columns: ${headers.length}`);
    lines.push('');

    lines.push('Column Information:');
    for (const stat of stats) {
      if (stat.type === 'numeric') {
        lines.push(`- ${stat.column}: numeric, range [${stat.min?.toFixed(2)} - ${stat.max?.toFixed(2)}], mean: ${stat.mean?.toFixed(2)}`);
      } else if (stat.type === 'datetime') {
        lines.push(`- ${stat.column}: datetime`);
      } else {
        lines.push(`- ${stat.column}: string, ${stat.uniqueCount} unique values`);
      }
    }

    // Add sample rows
    lines.push('');
    lines.push('Sample Data (first 5 rows):');
    const sampleRows = rows.slice(0, 5);
    for (const row of sampleRows) {
      const values = headers.slice(0, 5).map(h => `${h}: ${row[h]}`).join(', ');
      lines.push(`  ${values}${headers.length > 5 ? '...' : ''}`);
    }

    return lines.join('\n');
  }
}

export default CSVProcessorService;
