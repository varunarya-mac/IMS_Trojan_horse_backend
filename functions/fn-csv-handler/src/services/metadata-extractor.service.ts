/**
 * Metadata Extractor Service
 * Extracts metadata from CSV files for refrigeration data
 */

import type { CSVRow } from '../types.js';
import type {
  CSVMetadata,
  ColumnStatistics,
  TimeRange,
} from '@lib/types/csv.types.js';
import type { StoreInfo, DeviceType } from '@lib/types/chat.types.js';

/**
 * Metadata Extractor Service
 */
export class MetadataExtractorService {
  /**
   * Extract full metadata from CSV data
   */
  extractMetadata(
    headers: string[],
    rows: CSVRow[],
    fileInfo: { fileId: string; fileName: string; fileSize: number }
  ): CSVMetadata {
    const timeRange = this.extractTimeRange(rows, headers);
    const columnStats = this.calculateColumnStatistics(headers, rows);
    const storeInfo = this.detectStoreInfo(headers, rows);
    const deviceType = this.detectDeviceType(headers, rows);

    return {
      fileId: fileInfo.fileId,
      fileName: fileInfo.fileName,
      fileSize: fileInfo.fileSize,
      rowCount: rows.length,
      columnCount: headers.length,
      columns: headers,
      timeRange,
      columnStats,
      detectedDeviceType: deviceType,
      detectedStoreInfo: storeInfo,
    };
  }

  /**
   * Extract time range from data
   */
  extractTimeRange(rows: CSVRow[], headers: string[]): TimeRange | null {
    // Find timestamp column
    const timestampCol = headers.find(h =>
      h.toLowerCase().includes('timestamp') ||
      h.toLowerCase() === 'time' ||
      h.toLowerCase() === 'date' ||
      h.toLowerCase() === 'datetime'
    );

    if (!timestampCol || rows.length === 0) {
      return null;
    }

    const timestamps = rows
      .map(r => new Date(r[timestampCol]))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (timestamps.length === 0) {
      return null;
    }

    const start = timestamps[0];
    const end = timestamps[timestamps.length - 1];
    const durationMs = end.getTime() - start.getTime();

    return {
      start: start.toISOString(),
      end: end.toISOString(),
      durationHours: Math.round(durationMs / (1000 * 60 * 60) * 10) / 10,
      dataPointCount: timestamps.length,
    };
  }

  /**
   * Calculate statistics for each column
   */
  calculateColumnStatistics(headers: string[], rows: CSVRow[]): ColumnStatistics[] {
    const stats: ColumnStatistics[] = [];

    for (const header of headers) {
      const values = rows.map(r => r[header] || '');
      const numericValues = values
        .map(v => parseFloat(v))
        .filter(v => !isNaN(v));

      const isNumeric = numericValues.length > values.length * 0.8;
      const nullCount = values.filter(v => !v || v.trim() === '').length;
      const uniqueCount = new Set(values).size;

      const colStats: ColumnStatistics = {
        column: header,
        type: isNumeric ? 'numeric' : 'string',
        nullCount,
        uniqueCount,
        sampleValues: values.slice(0, 5),
      };

      if (isNumeric && numericValues.length > 0) {
        const sorted = [...numericValues].sort((a, b) => a - b);
        colStats.min = sorted[0];
        colStats.max = sorted[sorted.length - 1];
        colStats.mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;

        // Calculate standard deviation
        const variance =
          numericValues.reduce((a, b) => a + Math.pow(b - colStats.mean!, 2), 0) /
          numericValues.length;
        colStats.stdDev = Math.sqrt(variance);

        // Percentiles
        colStats.percentile25 = this.percentile(sorted, 25);
        colStats.percentile50 = this.percentile(sorted, 50);
        colStats.percentile75 = this.percentile(sorted, 75);
      }

      stats.push(colStats);
    }

    return stats;
  }

  /**
   * Detect store information from data
   */
  detectStoreInfo(headers: string[], rows: CSVRow[]): StoreInfo | null {
    // Look for store-related columns
    const storeCol = headers.find(h =>
      h.toLowerCase().includes('store') ||
      h.toLowerCase().includes('location') ||
      h.toLowerCase().includes('site')
    );

    const storeIdCol = headers.find(h =>
      h.toLowerCase().includes('store_id') ||
      h.toLowerCase().includes('storeid') ||
      h.toLowerCase().includes('site_id')
    );

    if (!storeCol && !storeIdCol) {
      return null;
    }

    const firstRow = rows[0];
    if (!firstRow) return null;

    const storeId = storeIdCol ? firstRow[storeIdCol] : undefined;
    const storeName = storeCol ? firstRow[storeCol] : undefined;

    // Check for consistent store info
    const isConsistent = rows.every(r => {
      const idMatch = !storeIdCol || r[storeIdCol] === storeId;
      const nameMatch = !storeCol || r[storeCol] === storeName;
      return idMatch && nameMatch;
    });

    if (!isConsistent) {
      return {
        multipleStores: true,
        storeCount: new Set(rows.map(r => storeIdCol ? r[storeIdCol] : r[storeCol!])).size,
      };
    }

    return {
      storeId: storeId || undefined,
      storeName: storeName || undefined,
    };
  }

  /**
   * Detect device type from data
   */
  detectDeviceType(headers: string[], rows: CSVRow[]): DeviceType | null {
    const headerLower = headers.map(h => h.toLowerCase());

    // Check for pack-specific columns
    const packIndicators = [
      'suction_pressure',
      'discharge_pressure',
      'compressor',
      'condenser',
      'pack',
    ];
    const hasPackColumns = packIndicators.some(ind =>
      headerLower.some(h => h.includes(ind))
    );

    // Check for case-specific columns
    const caseIndicators = [
      'air_on',
      'air_off',
      'case',
      'evaporator',
      'defrost',
    ];
    const hasCaseColumns = caseIndicators.some(ind =>
      headerLower.some(h => h.includes(ind))
    );

    // Also check data values for device type column
    const deviceTypeCol = headers.find(h =>
      h.toLowerCase().includes('device_type') ||
      h.toLowerCase().includes('devicetype') ||
      h.toLowerCase() === 'type'
    );

    if (deviceTypeCol && rows.length > 0) {
      const types = new Set(rows.map(r => r[deviceTypeCol]?.toLowerCase()));

      if (types.has('pack') && types.has('case')) return 'mixed';
      if (types.has('pack')) return 'pack';
      if (types.has('case')) return 'case';
    }

    // Determine from columns
    if (hasPackColumns && hasCaseColumns) return 'mixed';
    if (hasPackColumns) return 'pack';
    if (hasCaseColumns) return 'case';

    return null;
  }

  /**
   * Calculate percentile value
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0];

    const index = (p / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedValues[lower];
    }

    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
  }

  /**
   * Extract summary for AI analysis
   */
  extractSummaryForAnalysis(
    headers: string[],
    rows: CSVRow[],
    metadata: CSVMetadata
  ): string {
    const lines: string[] = [];

    lines.push(`CSV Summary:`);
    lines.push(`- File: ${metadata.fileName} (${Math.round(metadata.fileSize / 1024)}KB)`);
    lines.push(`- Rows: ${metadata.rowCount}, Columns: ${metadata.columnCount}`);

    if (metadata.timeRange) {
      lines.push(`- Time Range: ${metadata.timeRange.start} to ${metadata.timeRange.end}`);
      lines.push(`- Duration: ${metadata.timeRange.durationHours} hours`);
    }

    if (metadata.detectedDeviceType) {
      lines.push(`- Device Type: ${metadata.detectedDeviceType}`);
    }

    if (metadata.detectedStoreInfo) {
      if (metadata.detectedStoreInfo.multipleStores) {
        lines.push(`- Multiple stores detected: ${metadata.detectedStoreInfo.storeCount}`);
      } else {
        lines.push(`- Store: ${metadata.detectedStoreInfo.storeName || metadata.detectedStoreInfo.storeId || 'Unknown'}`);
      }
    }

    lines.push(`\nKey Columns:`);
    for (const col of metadata.columnStats.slice(0, 10)) {
      if (col.type === 'numeric' && col.min !== undefined) {
        lines.push(`- ${col.column}: ${col.min.toFixed(2)} to ${col.max?.toFixed(2)} (mean: ${col.mean?.toFixed(2)})`);
      }
    }

    return lines.join('\n');
  }
}

export default MetadataExtractorService;
