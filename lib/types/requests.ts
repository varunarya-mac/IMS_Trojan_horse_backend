/**
 * API Request Types
 * These interfaces represent the expected request body structures
 */

import type { ProgramModule } from './program-modules.js';

/**
 * Import configuration request
 */
export interface ImportConfigRequest {
  jsonContent: string; // Raw JSON content
  overwriteExisting?: boolean;
}

/**
 * Create alarm pattern request
 */
export interface CreateAlarmPatternRequest {
  no: number;
  alarmId: string;
  textExpr: string;
  genericFamily: string;
  genericId: string;
  trapPdu1: string;
  trapFlag: number;
  suppressionPeriod: number;
  programModules?: ProgramModule[];
  createdBy?: string;
}

/**
 * Update alarm pattern request
 */
export interface UpdateAlarmPatternRequest {
  textExpr?: string;
  genericFamily?: string;
  genericId?: string;
  trapPdu1?: string;
  trapFlag?: number;
  suppressionPeriod?: number;
  programModules?: ProgramModule[];
  changeDescription: string; // Required for audit trail
  updatedBy: string; // Required for audit trail
}

/**
 * Rollback alarm pattern request
 */
export interface RollbackAlarmPatternRequest {
  targetVersion: number;
  rollbackBy: string;
  reason?: string;
}

/**
 * Update class request
 */
export interface UpdateClassRequest {
  description?: string;
  defaultFlag?: number;
  data?: Record<string, unknown>;
  patterns?: Array<{ pattern: string; flags: number }>;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/**
 * Query parameters for alarm patterns
 */
export interface AlarmPatternQueryParams extends PaginationParams {
  disciplineTypeId?: string;
  alarmId?: string;
  genericFamily?: string;
  includeHistory?: boolean;
}

/**
 * Query parameters for version history
 */
export interface VersionHistoryQueryParams extends PaginationParams {
  fromVersion?: number;
  toVersion?: number;
}
