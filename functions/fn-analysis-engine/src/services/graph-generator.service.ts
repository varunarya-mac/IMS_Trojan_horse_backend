/**
 * Graph Generator Service
 * Generates chart images using Chart.js
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { ChartConfiguration, ChartType } from 'chart.js';
import { getStorage, BUCKET_IDS } from '@lib/utils/db.js';
import { InputFile } from 'node-appwrite/file';
import { ID } from 'node-appwrite';
import type { GraphConfig, GraphResult } from '../types.js';

/**
 * Graph Generator Service
 */
export class GraphGeneratorService {
  private readonly width: number = 800;
  private readonly height: number = 400;
  private readonly chartJSNodeCanvas: ChartJSNodeCanvas;

  constructor(options: { width?: number; height?: number } = {}) {
    this.width = options.width || 800;
    this.height = options.height || 400;

    this.chartJSNodeCanvas = new ChartJSNodeCanvas({
      width: this.width,
      height: this.height,
      backgroundColour: 'white',
    });
  }

  /**
   * Generate graph from config and upload to storage
   */
  async generateAndUpload(config: GraphConfig, fileNamePrefix: string): Promise<GraphResult> {
    // Generate chart image
    const imageBuffer = await this.generateChart(config);

    // Upload to storage
    const storage = getStorage();
    const fileName = `${fileNamePrefix}-${Date.now()}.png`;

    const file = await storage.createFile({
      bucketId: BUCKET_IDS.REFRIGERATION_FILES,
      fileId: ID.unique(),
      file: InputFile.fromBuffer(imageBuffer, fileName)
  });

    // Build URL
    const endpoint = process.env.APPWRITE_ENDPOINT || 'https://fra.appwrite.io/v1';
    const projectId = process.env.APPWRITE_PROJECT_ID || '';
    const graphUrl = `${endpoint}/storage/buckets/${BUCKET_IDS.REFRIGERATION_FILES}/files/${file.$id}/view?project=${projectId}`;

    return {
      graphImageId: file.$id,
      graphUrl,
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Generate chart image buffer
   */
  async generateChart(config: GraphConfig): Promise<Buffer> {
    const chartConfig = this.buildChartConfig(config);
    return await this.chartJSNodeCanvas.renderToBuffer(chartConfig);
  }

  /**
   * Build Chart.js configuration
   */
  private buildChartConfig(config: GraphConfig): ChartConfiguration {
    const { type, title, xAxis, yAxis, data, options } = config;

    // Extract labels (x-axis values)
    const labels = data.map(row => row[xAxis.column] || '');

    // Build datasets for each y-axis column
    const colors = options?.colorScheme || this.getDefaultColors();
    const datasets = yAxis.columns.map((col, index) => {
      const values = data.map(row => {
        const val = parseFloat(row[col] || '0');
        return isNaN(val) ? 0 : val;
      });

      return {
        label: col,
        data: values,
        borderColor: colors[index % colors.length],
        backgroundColor: this.hexToRgba(colors[index % colors.length], 0.1),
        fill: type === 'line',
        tension: 0.1,
        pointRadius: type === 'scatter' ? 4 : 2,
      };
    });

    const chartConfig: ChartConfiguration = {
      type: type as ChartType,
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: title,
            font: {
              size: 16,
              weight: 'bold',
            },
          },
          legend: {
            display: options?.showLegend !== false && yAxis.columns.length > 1,
            position: 'bottom',
          },
        },
        scales: {
          x: {
            title: {
              display: !!xAxis.label,
              text: xAxis.label || '',
            },
            ticks: {
              maxTicksLimit: 10,
              maxRotation: 45,
            },
          },
          y: {
            title: {
              display: !!yAxis.label,
              text: yAxis.label || '',
            },
            beginAtZero: false,
          },
        },
      },
    };

    return chartConfig;
  }

  /**
   * Get default color palette
   */
  private getDefaultColors(): string[] {
    return [
      '#2563eb', // Blue
      '#dc2626', // Red
      '#16a34a', // Green
      '#ca8a04', // Yellow
      '#9333ea', // Purple
      '#0891b2', // Cyan
      '#ea580c', // Orange
      '#4f46e5', // Indigo
    ];
  }

  /**
   * Convert hex color to rgba
   */
  private hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(0, 0, 0, ${alpha})`;

    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
  }

  /**
   * Validate graph config
   */
  validateConfig(config: GraphConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.type || !['line', 'bar', 'scatter'].includes(config.type)) {
      errors.push('Invalid chart type');
    }

    if (!config.title) {
      errors.push('Chart title is required');
    }

    if (!config.xAxis?.column) {
      errors.push('X-axis column is required');
    }

    if (!config.yAxis?.columns || config.yAxis.columns.length === 0) {
      errors.push('At least one Y-axis column is required');
    }

    if (!config.data || config.data.length === 0) {
      errors.push('Chart data is required');
    }

    // Check if columns exist in data
    if (config.data && config.data.length > 0) {
      const sampleRow = config.data[0];
      if (!(config.xAxis.column in sampleRow)) {
        errors.push(`X-axis column "${config.xAxis.column}" not found in data`);
      }
      for (const col of config.yAxis.columns) {
        if (!(col in sampleRow)) {
          errors.push(`Y-axis column "${col}" not found in data`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get recommended chart type based on data
   */
  recommendChartType(data: Record<string, string>[], columns: string[]): 'line' | 'bar' | 'scatter' {
    // Check if x-axis looks like time series
    const firstCol = columns[0];
    if (!data[0] || !firstCol) return 'bar';

    const sampleValues = data.slice(0, 10).map(r => r[firstCol]);
    const hasTimeValues = sampleValues.some(v => {
      if (!v) return false;
      const date = new Date(v);
      return !isNaN(date.getTime());
    });

    if (hasTimeValues && data.length > 10) {
      return 'line';
    }

    if (columns.length === 2) {
      return 'scatter';
    }

    return 'bar';
  }
}

export default GraphGeneratorService;
