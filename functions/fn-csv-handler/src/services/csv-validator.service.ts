/**
 * CSV Validator Service
 * Validates CSV format and columns for refrigeration data
 */

import { REFRIGERATION_COLUMNS, REQUIRED_COLUMNS } from '@lib/constants/refrigeration.js';
import type { CSVValidationResult, ColumnInfo } from '@lib/types/csv.types.js';

/**
 * Validate CSV content and structure
 */
export class CSVValidatorService {
  /**
   * Validate CSV headers
   */
  validateHeaders(headers: string[]): CSVValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!headers || headers.length === 0) {
      return {
        isValid: false,
        errors: ['CSV file has no headers'],
        warnings: [],
        columnCount: 0,
        rowCount: 0,
        detectedColumns: [],
        missingColumns: [],
        extraColumns: [],
      };
    }

    // Normalize headers
    const normalizedHeaders = headers.map(h => h.trim().toLowerCase());

    // Check for required columns based on detected data type (case, pack, or both)
    const missingRequired: string[] = [];

    // Check for timestamp (universally required)
    const hasTimestamp = normalizedHeaders.some(
      h => h === 'timestamp' || h.includes('timestamp')
    );
    if (!hasTimestamp) {
      missingRequired.push('timestamp');
    }

    // Detect if this is case data, pack data, or both
    const hasCaseIndicators = normalizedHeaders.some(
      h => h.includes('state_case') || h.includes('case_id') || h.includes('air_on') || h.includes('air_off')
    );
    const hasPackIndicators = normalizedHeaders.some(
      h => h.includes('state_pack') || h.includes('pack_id') || h.includes('suction')
    );

    // Validate case-specific required columns
    if (hasCaseIndicators) {
      for (const col of REQUIRED_COLUMNS.case.required) {
        if (col === 'timestamp') continue; // Already checked
        const found = normalizedHeaders.some(h => h === col.toLowerCase() || h.includes(col.toLowerCase()));
        if (!found) {
          missingRequired.push(col);
        }
      }
      // Check atLeastOne conditions for case
      for (const group of REQUIRED_COLUMNS.case.atLeastOne) {
        const hasAny = group.some(col =>
          normalizedHeaders.some(h => h === col.toLowerCase() || h.includes(col.toLowerCase()))
        );
        if (!hasAny) {
          warnings.push(`Missing at least one of: ${group.join(', ')}`);
        }
      }
    }

    // Validate pack-specific required columns
    if (hasPackIndicators) {
      for (const col of REQUIRED_COLUMNS.pack.required) {
        if (col === 'timestamp') continue; // Already checked
        const found = normalizedHeaders.some(h => h === col.toLowerCase() || h.includes(col.toLowerCase()));
        if (!found) {
          missingRequired.push(col);
        }
      }
      // Check atLeastOne conditions for pack
      for (const group of REQUIRED_COLUMNS.pack.atLeastOne) {
        const hasAny = group.some(col =>
          normalizedHeaders.some(h => h === col.toLowerCase() || h.includes(col.toLowerCase()))
        );
        if (!hasAny) {
          warnings.push(`Missing at least one of: ${group.join(', ')}`);
        }
      }
    }

    if (missingRequired.length > 0) {
      errors.push(`Missing required columns: ${[...new Set(missingRequired)].join(', ')}`);
    }

    // Check for duplicate headers
    const duplicates = headers.filter((h, i) => headers.indexOf(h) !== i);
    if (duplicates.length > 0) {
      errors.push(`Duplicate column names: ${[...new Set(duplicates)].join(', ')}`);
    }

    // Detect refrigeration columns
    const detectedRefrigColumns: string[] = [];
    const extraColumns: string[] = [];

    for (const header of normalizedHeaders) {
      const isRefrigColumn = REFRIGERATION_COLUMNS.some(
        refCol => header === refCol.toLowerCase() || header.includes(refCol.toLowerCase())
      );

      if (isRefrigColumn) {
        detectedRefrigColumns.push(header);
      } else {
        extraColumns.push(header);
      }
    }

    // Warn if too few refrigeration columns
    if (detectedRefrigColumns.length < 3) {
      warnings.push(
        `Only ${detectedRefrigColumns.length} refrigeration columns detected. Expected at least 3.`
      );
    }

    // Warn about extra columns
    if (extraColumns.length > 10) {
      warnings.push(`${extraColumns.length} unrecognized columns found`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      columnCount: headers.length,
      rowCount: 0, // Will be set during processing
      detectedColumns: detectedRefrigColumns,
      missingColumns: missingRequired,
      extraColumns,
    };
  }

  /**
   * Validate data types for a sample of rows
   */
  validateDataTypes(
    headers: string[],
    rows: Record<string, string>[]
  ): { columnInfo: ColumnInfo[]; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const columnInfo: ColumnInfo[] = [];

    if (rows.length === 0) {
      errors.push('CSV file has no data rows');
      return { columnInfo, errors, warnings };
    }

    for (const header of headers) {
      const values = rows.map(row => row[header] || '').filter(v => v !== '');
      const info = this.analyzeColumn(header, values);
      columnInfo.push(info);

      // Check timestamp column
      if (
        header.toLowerCase().includes('timestamp') ||
        header.toLowerCase().includes('time') ||
        header.toLowerCase() === 'date'
      ) {
        if (info.type !== 'datetime' && info.type !== 'string') {
          warnings.push(`Column "${header}" appears to be a timestamp but has inconsistent format`);
        }
      }

      // Check temperature columns
      if (header.toLowerCase().includes('temperature') || header.toLowerCase().includes('temp')) {
        if (info.type !== 'numeric') {
          errors.push(`Column "${header}" should contain numeric temperature values`);
        }
      }
    }

    return { columnInfo, errors, warnings };
  }

  /**
   * Analyze a column to determine its type and statistics
   */
  private analyzeColumn(name: string, values: string[]): ColumnInfo {
    const sampleValues = values.slice(0, 5);
    const nullCount = values.filter(v => !v || v.trim() === '').length;
    const uniqueCount = new Set(values).size;

    // Determine type
    let type: ColumnInfo['type'] = 'unknown';

    if (values.length === 0) {
      return { name, type, sampleValues, nullCount, uniqueCount };
    }

    const nonEmptyValues = values.filter(v => v && v.trim() !== '');

    // Check for numeric
    const numericCount = nonEmptyValues.filter(v => !isNaN(parseFloat(v))).length;
    if (numericCount / nonEmptyValues.length > 0.9) {
      type = 'numeric';
    }
    // Check for boolean
    else if (
      nonEmptyValues.every(v =>
        ['true', 'false', '0', '1', 'yes', 'no'].includes(v.toLowerCase())
      )
    ) {
      type = 'boolean';
    }
    // Check for datetime
    else if (this.isDatetimeColumn(nonEmptyValues)) {
      type = 'datetime';
    }
    // Default to string
    else {
      type = 'string';
    }

    return { name, type, sampleValues, nullCount, uniqueCount };
  }

  /**
   * Check if values appear to be datetime
   */
  private isDatetimeColumn(values: string[]): boolean {
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}/, // ISO date
      /^\d{2}\/\d{2}\/\d{4}/, // US date
      /^\d{2}-\d{2}-\d{4}/, // EU date
      /^\d{4}\/\d{2}\/\d{2}/, // Alternative ISO
    ];

    const matchCount = values.filter(v =>
      datePatterns.some(pattern => pattern.test(v))
    ).length;

    return matchCount / values.length > 0.9;
  }

  /**
   * Check for refrigeration-specific data quality issues
   */
  validateRefrigerationData(
    headers: string[],
    rows: Record<string, string>[]
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check temperature ranges
    const tempColumns = headers.filter(
      h =>
        h.toLowerCase().includes('temperature') ||
        h.toLowerCase().includes('air_on') ||
        h.toLowerCase().includes('air_off')
    );

    for (const tempCol of tempColumns) {
      const values = rows
        .map(r => parseFloat(r[tempCol]))
        .filter(v => !isNaN(v));

      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);

        // Refrigeration typically operates between -40°C and 20°C
        if (max > 50) {
          warnings.push(
            `Column "${tempCol}" has values above 50°C (max: ${max}°C) - verify units`
          );
        }
        if (min < -50) {
          warnings.push(
            `Column "${tempCol}" has values below -50°C (min: ${min}°C) - verify units`
          );
        }
      }
    }

    return { errors, warnings };
  }
}

export default CSVValidatorService;
