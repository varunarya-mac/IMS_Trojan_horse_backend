/**
 * CSV Parser Service
 * Parses CSV files with streaming support for large files
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
 * CSV Parser Service
 */
export class CSVParserService {
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
        cast: false, // Keep all values as strings for consistent processing
      });

      parser.on('readable', () => {
        let record;
        while ((record = parser.read()) !== null) {
          totalRows++;

          // Get headers from first record
          if (headers.length === 0 && record) {
            headers = Object.keys(record);
          }

          // Respect max rows limit
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

      // Write content to parser
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
   * Parse only headers (first line)
   */
  async parseHeaders(content: string | Buffer): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: false,
        to: 1, // Only read first line
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
   * Parse specific columns only
   */
  async parseColumns(
    content: string | Buffer,
    columns: string[],
    options: { maxRows?: number } = {}
  ): Promise<ParseResult> {
    const { maxRows = 50000 } = options;

    const fullResult = await this.parse(content, { maxRows });

    // Filter to only requested columns
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
   * Parse with time range filter
   */
  async parseWithTimeRange(
    content: string | Buffer,
    timestampColumn: string,
    startTime: Date,
    endTime: Date,
    options: { maxRows?: number } = {}
  ): Promise<ParseResult> {
    const { maxRows = 50000 } = options;
    const fullResult = await this.parse(content, { maxRows: maxRows * 2 }); // Parse more to account for filtering

    // Filter by time range
    const filteredRows = fullResult.rows.filter(row => {
      const timestampValue = row[timestampColumn];
      if (!timestampValue) return false;

      const rowTime = new Date(timestampValue);
      if (isNaN(rowTime.getTime())) return false;

      return rowTime >= startTime && rowTime <= endTime;
    });

    return {
      headers: fullResult.headers,
      rows: filteredRows.slice(0, maxRows),
      totalRows: filteredRows.length,
      wasTruncated: filteredRows.length > maxRows,
    };
  }

  /**
   * Count rows without loading all data
   */
  async countRows(content: string | Buffer): Promise<number> {
    return new Promise((resolve, reject) => {
      let count = 0;

      const parser = parse({
        columns: true,
        skip_empty_lines: true,
      });

      parser.on('readable', () => {
        while (parser.read() !== null) {
          count++;
        }
      });

      parser.on('error', (err) => {
        reject(new Error(`CSV counting error: ${err.message}`));
      });

      parser.on('end', () => {
        resolve(count);
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

export default CSVParserService;
