/**
 * Data Transfer Objects (DTOs)
 * These interfaces represent the API response structures
 */

import type { ProgramModule } from './program-modules.js';

/**
 * Base API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

/**
 * Discipline DTO for API responses
 */
export interface DisciplineDTO {
  id: string;
  name: string;
  enterpriseName: string;
  enterpriseVersion: number;
  createdAt: string;
  updatedAt: string;
  types?: DisciplineTypeDTO[];
}

/**
 * Discipline Type DTO for API responses
 */
export interface DisciplineTypeDTO {
  id: string;
  disciplineId: string;
  name: string;
  createdAt: string;
  discipline?: {
    id: string;
    name: string;
  };
}

/**
 * Alarm Pattern DTO for API responses
 */
export interface AlarmPatternDTO {
  id: string;
  disciplineTypeId: string;
  alarmPatternKey: string;
  version: number;
  isLatest: boolean;
  no: number;
  alarmId: string;
  textExpr: string;
  genericFamily: string;
  genericId: string;
  trapPdu1: string;
  trapFlag: number;
  suppressionPeriod: number;
  programModules: ProgramModule[];
  createdAt: string;
  createdBy: string | null;
  changeDescription: string | null;
}

/**
 * Alarm Flow DTO - includes context from parent entities
 */
export interface AlarmFlowDTO {
  discipline: {
    id: string;
    name: string;
  };
  disciplineType: {
    id: string;
    name: string;
  };
  alarm: AlarmPatternDTO;
  relatedClasses: ClassDTO[];
}

/**
 * Alarm Version DTO - for version history responses
 */
export interface AlarmVersionDTO {
  version: number;
  createdAt: string;
  createdBy: string | null;
  changeDescription: string | null;
  isLatest: boolean;
  alarm: AlarmPatternDTO;
}

/**
 * Class DTO for API responses
 */
export interface ClassDTO {
  id: string;
  disciplineTypeId: string;
  classId: string;
  description: string;
  defaultFlag: number;
  data: SeverityThreshold | null;
  patterns: ClassPattern[] | null;
  createdAt: string;
}

/**
 * Severity threshold configuration
 */
export interface SeverityThreshold {
  ok?: [number | null, string | null];
  recovering?: [number | null, string | null];
  warning?: [number | null, string | null];
  minor?: [number | null, string | null];
  major?: [number | null, string | null];
  critical?: [number | null, string | null];
  terminal?: [number | null, string | null];
}

/**
 * Class pattern configuration
 */
export interface ClassPattern {
  pattern: string;
  flags: number;
}

/**
 * Field DTO for API responses
 */
export interface FieldDTO {
  id: string;
  disciplineTypeId: string;
  name: string;
  arrayType: string | null;
  arraySize: number | null;
  fieldType1: string | null;
  fieldType2: string | null;
  createdAt: string;
}

/**
 * Import summary DTO
 */
export interface ImportSummaryDTO {
  disciplinesCreated: number;
  disciplineTypesCreated: number;
  alarmPatternsCreated: number;
  classesCreated: number;
  fieldsCreated: number;
  errors: ImportErrorDetail[];
}

/**
 * Import error details
 */
export interface ImportErrorDetail {
  type: 'discipline' | 'disciplineType' | 'alarmPattern' | 'class' | 'field';
  name: string;
  message: string;
}

/**
 * Disciplines list response
 */
export interface DisciplinesListDTO {
  disciplines: DisciplineDTO[];
}

/**
 * Alarm flows list response (single discipline type)
 */
export interface AlarmFlowsListDTO {
  discipline: {
    id: string;
    name: string;
  };
  disciplineType: {
    id: string;
    name: string;
  };
  alarms: AlarmPatternDTO[];
  classes: ClassDTO[];
}

/**
 * Alarm flows grouped by discipline response
 */
export interface AlarmFlowsByDisciplineDTO {
  discipline: {
    id: string;
    name: string;
  };
  disciplineTypes: Array<{
    disciplineType: {
      id: string;
      name: string;
    };
    alarms: AlarmPatternDTO[];
    classes: ClassDTO[];
  }>;
}

/**
 * Version history response
 */
export interface VersionHistoryDTO {
  alarmPatternKey: string;
  currentVersion: number;
  versions: AlarmVersionDTO[];
}
