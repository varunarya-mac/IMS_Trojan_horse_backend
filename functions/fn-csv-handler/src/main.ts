/**
 * CSV Handler - Entry Point
 *
 * Appwrite function for CSV file validation, parsing, and data extraction.
 * This function is called by fn-job-worker for background processing.
 *
 * Actions:
 *   validate           - Validate CSV format and columns
 *   process            - Parse CSV and extract metadata/statistics
 *   extract_for_graph  - Extract specific columns for graph generation
 */

import type { FunctionContext, CSVHandlerRequest, CSVHandlerResponse } from './types.js';
import { CSVParserService } from './services/csv-parser.service.js';
import { CSVValidatorService } from './services/csv-validator.service.js';
import { CSVSamplerService } from './services/csv-sampler.service.js';
import { MetadataExtractorService } from './services/metadata-extractor.service.js';
import { getStorage, BUCKET_IDS } from '@lib/utils/db.js';

/**
 * Parse request body
 */
function parseRequest(body: string): CSVHandlerRequest | null {
  try {
    if (!body || body === '') return null;
    return JSON.parse(body) as CSVHandlerRequest;
  } catch {
    return null;
  }
}

/**
 * Send response
 */
function sendResponse(
  res: FunctionContext['res'],
  response: CSVHandlerResponse,
  status: number = 200
): unknown {
  return res.json(response, status, {
    'Access-Control-Allow-Origin': '*',
  });
}

/**
 * Send error response
 */
function sendError(
  res: FunctionContext['res'],
  code: string,
  message: string,
  status: number = 500,
  details?: unknown
): unknown {
  return sendResponse(
    res,
    {
      success: false,
      action: 'error',
      error: { code, message, details },
    },
    status
  );
}

/**
 * Download file from storage
 */
async function downloadFile(fileId: string): Promise<Buffer> {
  const storage = getStorage();
  const fileBuffer = await storage.getFileDownload(BUCKET_IDS.REFRIGERATION_FILES, fileId);
  return Buffer.from(fileBuffer);
}

/**
 * Handle validate action
 */
async function handleValidate(
  context: FunctionContext,
  request: CSVHandlerRequest
): Promise<CSVHandlerResponse> {
  const { log } = context;
  const { fileId, options } = request;

  log(`Validating CSV file: ${fileId}`);

  // Download file
  const fileContent = await downloadFile(fileId);
  log(`Downloaded file: ${fileContent.length} bytes`);

  // Parse headers
  const parser = new CSVParserService();
  const headers = await parser.parseHeaders(fileContent);
  log(`Found ${headers.length} columns`);

  // Validate headers
  const validator = new CSVValidatorService();
  const headerValidation = validator.validateHeaders(headers);

  if (!headerValidation.isValid) {
    return {
      success: false,
      action: 'validate',
      error: {
        code: 'VALIDATION_FAILED',
        message: 'CSV validation failed',
        details: {
          errors: headerValidation.errors,
          warnings: headerValidation.warnings,
        },
      },
    };
  }

  // Parse sample rows for data type validation
  if (options?.checkColumns !== false) {
    const parseResult = await parser.parse(fileContent, { maxRows: 100 });
    const dataValidation = validator.validateDataTypes(headers, parseResult.rows);
    const refrigValidation = validator.validateRefrigerationData(headers, parseResult.rows);

    // Combine all errors and warnings
    const allErrors = [
      ...headerValidation.errors,
      ...dataValidation.errors,
      ...refrigValidation.errors,
    ];
    const allWarnings = [
      ...headerValidation.warnings,
      ...dataValidation.warnings,
      ...refrigValidation.warnings,
    ];

    return {
      success: allErrors.length === 0,
      action: 'validate',
      data: {
        isValid: allErrors.length === 0,
        columnCount: headers.length,
        sampleRowCount: parseResult.rows.length,
        totalRows: parseResult.totalRows,
        detectedColumns: headerValidation.detectedColumns,
        missingColumns: headerValidation.missingColumns,
        columnInfo: dataValidation.columnInfo,
        errors: allErrors,
        warnings: allWarnings,
      },
    };
  }

  return {
    success: true,
    action: 'validate',
    data: {
      isValid: true,
      columnCount: headers.length,
      detectedColumns: headerValidation.detectedColumns,
      missingColumns: headerValidation.missingColumns,
      errors: headerValidation.errors,
      warnings: headerValidation.warnings,
    },
  };
}

/**
 * Handle process action
 */
async function handleProcess(
  context: FunctionContext,
  request: CSVHandlerRequest
): Promise<CSVHandlerResponse> {
  const { log } = context;
  const { fileId, options } = request;

  log(`Processing CSV file: ${fileId}`);

  // Download file
  const fileContent = await downloadFile(fileId);
  const fileSize = fileContent.length;
  log(`Downloaded file: ${fileSize} bytes`);

  // Parse CSV
  const parser = new CSVParserService();
  const sampler = new CSVSamplerService();
  const metadataExtractor = new MetadataExtractorService();

  // Determine sample size
  const maxRows = options?.sampleSize || sampler.getRecommendedSampleSize(50000, fileSize);
  log(`Using max rows: ${maxRows}`);

  // Parse full CSV (up to max rows)
  const parseResult = await parser.parse(fileContent, { maxRows: maxRows * 2 });
  log(`Parsed ${parseResult.totalRows} rows (${parseResult.rows.length} loaded)`);

  // Sample if needed
  const timestampCol = parseResult.headers.find(
    h =>
      h.toLowerCase().includes('timestamp') ||
      h.toLowerCase() === 'time' ||
      h.toLowerCase() === 'date'
  );

  const sampleResult = sampler.sample(parseResult.rows, {
    maxSamples: maxRows,
    timestampColumn: timestampCol,
    preserveAnomalies: true,
  });
  log(`Sampled: ${sampleResult.sampleSize} rows (method: ${sampleResult.samplingMethod})`);

  // Extract metadata
  const storage = getStorage();
  const fileInfo = await storage.getFile(BUCKET_IDS.REFRIGERATION_FILES, fileId);
  const metadata = metadataExtractor.extractMetadata(parseResult.headers, sampleResult.rows, {
    fileId,
    fileName: fileInfo.name,
    fileSize,
  });
  log(`Extracted metadata for ${metadata.columnCount} columns`);

  // Calculate statistics if requested
  let statistics = null;
  if (options?.calculateStatistics !== false) {
    statistics = metadataExtractor.calculateColumnStatistics(
      parseResult.headers,
      sampleResult.rows
    );
  }

  // Detect anomalies if requested
  let anomalies = null;
  if (options?.detectAnomalies) {
    anomalies = detectAnomalies(parseResult.headers, sampleResult.rows);
    log(`Detected ${anomalies.length} potential anomalies`);
  }

  // Generate summary for AI
  const summary = metadataExtractor.extractSummaryForAnalysis(
    parseResult.headers,
    sampleResult.rows,
    metadata
  );

  return {
    success: true,
    action: 'process',
    data: {
      metadata,
      statistics,
      anomalies,
      summary,
      sampling: {
        method: sampleResult.samplingMethod,
        sampleSize: sampleResult.sampleSize,
        totalRows: sampleResult.totalRows,
        sampleRate: sampleResult.sampleRate,
        wasTruncated: parseResult.wasTruncated,
      },
    },
  };
}

/**
 * Handle extract_for_graph action
 */
async function handleExtractForGraph(
  context: FunctionContext,
  request: CSVHandlerRequest
): Promise<CSVHandlerResponse> {
  const { log } = context;
  const { fileId, options } = request;

  if (!options?.columns || options.columns.length === 0) {
    return {
      success: false,
      action: 'extract_for_graph',
      error: {
        code: 'MISSING_COLUMNS',
        message: 'No columns specified for extraction',
      },
    };
  }

  log(`Extracting columns for graph: ${options.columns.join(', ')}`);

  // Download file
  const fileContent = await downloadFile(fileId);

  // Parse with time range if specified
  const parser = new CSVParserService();
  let parseResult;

  if (options.timeRange) {
    const startTime = new Date(options.timeRange.start);
    const endTime = new Date(options.timeRange.end);
    const timestampCol = options.columns.find(
      c =>
        c.toLowerCase().includes('timestamp') ||
        c.toLowerCase() === 'time' ||
        c.toLowerCase() === 'date'
    );

    if (timestampCol) {
      parseResult = await parser.parseWithTimeRange(
        fileContent,
        timestampCol,
        startTime,
        endTime,
        { maxRows: options.maxDataPoints || 1000 }
      );
    } else {
      parseResult = await parser.parseColumns(fileContent, options.columns, {
        maxRows: options.maxDataPoints || 1000,
      });
    }
  } else {
    parseResult = await parser.parseColumns(fileContent, options.columns, {
      maxRows: options.maxDataPoints || 1000,
    });
  }

  log(`Extracted ${parseResult.rows.length} rows for ${parseResult.headers.length} columns`);

  // Apply aggregation if requested
  let data = parseResult.rows;
  if (options.aggregation && options.aggregation !== 'none') {
    data = aggregateData(parseResult.rows, options.columns, options.aggregation);
    log(`Aggregated to ${data.length} data points (${options.aggregation})`);
  }

  // Limit data points
  const maxDataPoints = options.maxDataPoints || 500;
  if (data.length > maxDataPoints) {
    const step = Math.ceil(data.length / maxDataPoints);
    data = data.filter((_, i) => i % step === 0);
    log(`Downsampled to ${data.length} data points`);
  }

  return {
    success: true,
    action: 'extract_for_graph',
    data: {
      columns: parseResult.headers,
      rows: data,
      rowCount: data.length,
      totalRows: parseResult.totalRows,
      wasTruncated: parseResult.wasTruncated,
    },
  };
}

/**
 * Detect anomalies in data
 */
function detectAnomalies(
  headers: string[],
  rows: Record<string, string>[]
): Array<{ row: number; column: string; value: number; type: string; description: string }> {
  const anomalies: Array<{
    row: number;
    column: string;
    value: number;
    type: string;
    description: string;
  }> = [];

  // Find numeric columns
  const numericCols = headers.filter(h => {
    const values = rows.slice(0, 100).map(r => parseFloat(r[h]));
    return values.filter(v => !isNaN(v)).length > 80;
  });

  // Calculate statistics for each column
  for (const col of numericCols) {
    const values = rows.map((r, i) => ({ value: parseFloat(r[col]), row: i })).filter(v => !isNaN(v.value));
    if (values.length < 10) continue;

    const nums = values.map(v => v.value);
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const std = Math.sqrt(nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / nums.length);

    // Find outliers (> 3 standard deviations)
    for (const { value, row } of values) {
      const zScore = Math.abs(value - mean) / std;
      if (zScore > 3) {
        anomalies.push({
          row,
          column: col,
          value,
          type: 'outlier',
          description: `Value ${value.toFixed(2)} is ${zScore.toFixed(1)} standard deviations from mean (${mean.toFixed(2)})`,
        });
      }
    }
  }

  return anomalies.slice(0, 100); // Limit to 100 anomalies
}

/**
 * Aggregate data by time period
 */
function aggregateData(
  rows: Record<string, string>[],
  columns: string[],
  aggregation: 'hourly' | 'daily'
): Record<string, string>[] {
  const timestampCol = columns.find(
    c =>
      c.toLowerCase().includes('timestamp') ||
      c.toLowerCase() === 'time' ||
      c.toLowerCase() === 'date'
  );

  if (!timestampCol) return rows;

  const buckets = new Map<string, { count: number; sums: Record<string, number> }>();

  for (const row of rows) {
    const timestamp = new Date(row[timestampCol]);
    if (isNaN(timestamp.getTime())) continue;

    // Create bucket key
    let bucketKey: string;
    if (aggregation === 'hourly') {
      bucketKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:00`;
    } else {
      bucketKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')}`;
    }

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, { count: 0, sums: {} });
    }

    const bucket = buckets.get(bucketKey)!;
    bucket.count++;

    // Sum numeric columns
    for (const col of columns) {
      if (col === timestampCol) continue;
      const value = parseFloat(row[col]);
      if (!isNaN(value)) {
        bucket.sums[col] = (bucket.sums[col] || 0) + value;
      }
    }
  }

  // Convert buckets to rows
  const aggregated: Record<string, string>[] = [];
  for (const [key, bucket] of buckets) {
    const row: Record<string, string> = { [timestampCol]: key };
    for (const col of columns) {
      if (col === timestampCol) continue;
      if (bucket.sums[col] !== undefined) {
        row[col] = (bucket.sums[col] / bucket.count).toFixed(2);
      }
    }
    aggregated.push(row);
  }

  return aggregated.sort((a, b) => a[timestampCol].localeCompare(b[timestampCol]));
}

/**
 * Main function handler
 */
export default async function (context: FunctionContext): Promise<unknown> {
  const { req, res, log, error: logError } = context;

  log(`CSV Handler: ${req.method} ${req.path}`);

  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    return res.send('', 204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Only POST method is allowed', 405);
  }

  // Parse request
  const request = parseRequest(req.body);
  if (!request) {
    return sendError(res, 'INVALID_REQUEST', 'Invalid request body', 400);
  }

  if (!request.action) {
    return sendError(res, 'MISSING_ACTION', 'Action is required', 400);
  }

  if (!request.fileId) {
    return sendError(res, 'MISSING_FILE_ID', 'File ID is required', 400);
  }

  try {
    let response: CSVHandlerResponse;

    switch (request.action) {
      case 'validate':
        response = await handleValidate(context, request);
        break;
      case 'process':
        response = await handleProcess(context, request);
        break;
      case 'extract_for_graph':
        response = await handleExtractForGraph(context, request);
        break;
      default:
        return sendError(res, 'INVALID_ACTION', `Unknown action: ${request.action}`, 400);
    }

    return sendResponse(res, response, response.success ? 200 : 400);
  } catch (error) {
    logError(`Error in CSV Handler: ${error instanceof Error ? error.message : String(error)}`);
    return sendError(
      res,
      'PROCESSING_ERROR',
      error instanceof Error ? error.message : 'An error occurred while processing CSV',
      500
    );
  }
}
