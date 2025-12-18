/**
 * Graph Generator Service
 * Generates chart SVG images using pure JavaScript (no native dependencies)
 */

import { Client, Storage, ID } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { SvgCanvas, Rect2D, SvgCanvas2DGradient } from 'red-agate-svg-canvas';
import { Chart, registerables } from 'chart.js';
import type { GraphConfig, GraphResult } from '../types.js';

// Register all Chart.js components
Chart.register(...registerables);

// Set CanvasGradient in global scope for Chart.js compatibility
(globalThis as any).CanvasGradient = SvgCanvas2DGradient;

/**
 * Chart.js configuration type
 */
interface ChartConfiguration {
  type: string;
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      borderColor: string;
      backgroundColor: string;
      fill: boolean;
      tension: number;
      pointRadius: number;
    }>;
  };
  options: {
    responsive: boolean;
    maintainAspectRatio: boolean;
    animation: boolean;
    devicePixelRatio: number;
    plugins: {
      title: {
        display: boolean;
        text: string;
        font: {
          size: number;
          weight: string;
        };
      };
      legend: {
        display: boolean;
        position: string;
      };
    };
    scales: {
      x: {
        title: {
          display: boolean;
          text: string;
        };
        ticks: {
          maxTicksLimit: number;
          maxRotation: number;
        };
      };
      y: {
        title: {
          display: boolean;
          text: string;
        };
        beginAtZero: boolean;
      };
    };
  };
}

/**
 * Graph Generator Configuration
 */
export interface GraphGeneratorConfig {
  endpoint: string;
  projectId: string;
  apiKey: string;
  bucketId: string;
  width?: number;
  height?: number;
}

/**
 * Graph Generator Service
 * Uses red-agate-svg-canvas for pure JavaScript SVG rendering (no native dependencies)
 */
export class GraphGeneratorService {
  private readonly width: number;
  private readonly height: number;
  private readonly storage: Storage;
  private readonly bucketId: string;
  private readonly endpoint: string;
  private readonly projectId: string;

  constructor(config: GraphGeneratorConfig) {
    this.width = config.width || 800;
    this.height = config.height || 400;
    this.bucketId = config.bucketId;
    this.endpoint = config.endpoint;
    this.projectId = config.projectId;

    const client = new Client()
      .setEndpoint(config.endpoint)
      .setProject(config.projectId)
      .setKey(config.apiKey);

    this.storage = new Storage(client);
  }

  /**
   * Generate graph from config and upload to storage
   */
  async generateAndUpload(config: GraphConfig, fileNamePrefix: string): Promise<GraphResult> {
    console.log('[SVG Graph] Starting chart generation...');

    // Generate chart SVG
    const svgBuffer = await this.generateChart(config);

    // Upload to storage (now .svg instead of .png)
    const fileName = `${fileNamePrefix}-${Date.now()}.svg`;

    console.log('[SVG Graph] Uploading SVG to storage:', fileName);

    const file = await this.storage.createFile(
      this.bucketId,
      ID.unique(),
      InputFile.fromBuffer(svgBuffer, fileName)
    );

    // Build URL
    const graphUrl = `${this.endpoint}/storage/buckets/${this.bucketId}/files/${file.$id}/view?project=${this.projectId}`;

    console.log('[SVG Graph] Upload successful:', file.$id);

    return {
      graphImageId: file.$id,
      graphUrl,
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Generate chart SVG buffer using pure JavaScript (red-agate-svg-canvas)
   */
  async generateChart(config: GraphConfig): Promise<Buffer> {
    const chartConfig = this.buildChartConfig(config);

    console.log('[SVG Graph] Chart type:', chartConfig.type);
    console.log('[SVG Graph] Chart title:', chartConfig.options?.plugins?.title?.text);
    console.log('[SVG Graph] Data points:', chartConfig.data?.labels?.length);
    console.log('[SVG Graph] Datasets:', chartConfig.data?.datasets?.length);

    // Create SVG canvas (pure JS, no native dependencies)
    const ctx = new SvgCanvas();

    // Polyfill missing Canvas 2D API methods that Chart.js 4.x requires
    if (!(ctx as any).resetTransform) {
      (ctx as any).resetTransform = function() {
        this.setTransform(1, 0, 0, 1, 0, 0);
      };
    }

    // Mock canvas element for Chart.js
    (ctx as any).canvas = {
      width: this.width,
      height: this.height,
      style: {
        width: `${this.width}px`,
        height: `${this.height}px`,
      },
    };
    ctx.fontHeightRatio = 2;

    // Create mock element that Chart.js expects
    const mockElement = {
      getContext: () => ctx,
      width: this.width,
      height: this.height,
      style: {},
    } as any;

    // Create the chart (this renders to the SVG canvas)
    new Chart(mockElement, chartConfig as any);

    // Render to SVG string
    const svgString = ctx.render(new Rect2D(0, 0, this.width, this.height), 'px');

    console.log('[SVG Graph] SVG generated, size:', svgString.length, 'characters');

    return Buffer.from(svgString, 'utf-8');
  }

  /**
   * Build Chart.js configuration from GraphConfig
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
      type: type,
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        animation: false, // Must be false for server-side rendering
        devicePixelRatio: 1,
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
}

export default GraphGeneratorService;
