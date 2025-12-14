/**
 * JSON Parser Utilities
 * Parses the TESCO alarm configuration JSON files
 */

import type { ProgramModule } from '../types/program-modules.js';
import { ImportError } from './errors.js';

/**
 * Raw JSON structure types (matching the source files)
 */
export interface RawEnterprise {
  name: string;
  version: number;
  disciplines: RawDiscipline[];
}

export interface RawDiscipline {
  name: string;
  discipline_types: RawDisciplineType[];
}

export interface RawDisciplineType {
  name: string;
  alarm_patterns?: RawAlarmPattern[];
  classes?: RawClass[];
  fields?: RawField[];
}

export interface RawAlarmPattern {
  no: number;
  id: string;
  text_expr: string;
  generic_family: string;
  generic_id: string;
  trap_pdu_1: string;
  trap_flag: number;
  suppression_period: number;
  program_modules?: RawProgramModule[];
}

export interface RawProgramModule {
  type: number;
  x: number;
  y: number;
  name: string;
  inputs?: string[];
  classes?: string[];
  parameters?: string[];
}

export interface RawClass {
  id: string;
  description: string;
  default_flag: number;
  data?: unknown[];
  patterns?: Array<{ pattern: string; flags: number }>;
}

export interface RawField {
  name: string;
  array_type?: string;
  array_size?: number;
  field_type_1?: string;
  field_type_2?: string;
}

/**
 * Parsed data structures (ready for database insertion)
 */
export interface ParsedDiscipline {
  name: string;
  enterpriseName: string;
  enterpriseVersion: number;
}

export interface ParsedDisciplineType {
  disciplineName: string;
  name: string;
}

export interface ParsedAlarmPattern {
  disciplineTypeName: string;
  disciplineName: string;
  no: number;
  alarmId: string;
  textExpr: string;
  genericFamily: string;
  genericId: string;
  trapPdu1: string;
  trapFlag: number;
  suppressionPeriod: number;
  programModules: ProgramModule[];
}

export interface ParsedClass {
  disciplineTypeName: string;
  disciplineName: string;
  classId: string;
  description: string;
  defaultFlag: number;
  data: unknown[] | null;
  patterns: Array<{ pattern: string; flags: number }> | null;
}

export interface ParsedField {
  disciplineTypeName: string;
  disciplineName: string;
  name: string;
  arrayType: string | null;
  arraySize: number | null;
  fieldType1: string | null;
  fieldType2: string | null;
}

/**
 * Complete parsed result
 */
export interface ParsedConfig {
  disciplines: ParsedDiscipline[];
  disciplineTypes: ParsedDisciplineType[];
  alarmPatterns: ParsedAlarmPattern[];
  classes: ParsedClass[];
  fields: ParsedField[];
}

/**
 * Parse JSON content into structured data
 * Supports two formats:
 * 1. { enterprise: { name, version, disciplines: [...] } }
 * 2. { enterprise: { name, version }, disciplines: [...] }
 */
export function parseConfigJson(jsonContent: string): ParsedConfig {
  let rawData: { enterprise: RawEnterprise; disciplines?: RawDiscipline[] };

  try {
    rawData = JSON.parse(jsonContent);
  } catch (error) {
    throw new ImportError('Invalid JSON format', { error: String(error) });
  }

  if (!rawData.enterprise) {
    throw new ImportError('Missing "enterprise" root object in JSON');
  }

  const enterprise = rawData.enterprise;

  // Support both formats: disciplines inside enterprise OR at root level
  const disciplines = enterprise.disciplines || rawData.disciplines;

  if (!enterprise.name || !Array.isArray(disciplines)) {
    throw new ImportError('Invalid enterprise structure: missing name or disciplines array');
  }

  // Attach disciplines to enterprise for downstream processing
  enterprise.disciplines = disciplines;

  const result: ParsedConfig = {
    disciplines: [],
    disciplineTypes: [],
    alarmPatterns: [],
    classes: [],
    fields: [],
  };

  // Parse disciplines
  for (const discipline of enterprise.disciplines) {
    if (!discipline.name || !Array.isArray(discipline.discipline_types)) {
      continue;
    }

    result.disciplines.push({
      name: discipline.name,
      enterpriseName: enterprise.name,
      enterpriseVersion: enterprise.version || 1,
    });

    // Parse discipline types
    for (const disciplineType of discipline.discipline_types) {
      if (!disciplineType.name) {
        continue;
      }

      result.disciplineTypes.push({
        disciplineName: discipline.name,
        name: disciplineType.name,
      });

      // Parse alarm patterns
      if (Array.isArray(disciplineType.alarm_patterns)) {
        for (const pattern of disciplineType.alarm_patterns) {
          result.alarmPatterns.push(parseAlarmPattern(pattern, discipline.name, disciplineType.name));
        }
      }

      // Parse classes
      if (Array.isArray(disciplineType.classes)) {
        for (const cls of disciplineType.classes) {
          result.classes.push(parseClass(cls, discipline.name, disciplineType.name));
        }
      }

      // Parse fields
      if (Array.isArray(disciplineType.fields)) {
        for (const field of disciplineType.fields) {
          result.fields.push(parseField(field, discipline.name, disciplineType.name));
        }
      }
    }
  }

  return result;
}

/**
 * Parse a single alarm pattern
 */
function parseAlarmPattern(
  raw: RawAlarmPattern,
  disciplineName: string,
  disciplineTypeName: string
): ParsedAlarmPattern {
  return {
    disciplineName,
    disciplineTypeName,
    no: raw.no || 0,
    alarmId: raw.id || '',
    textExpr: raw.text_expr || '',
    genericFamily: raw.generic_family || '',
    genericId: raw.generic_id || '',
    trapPdu1: raw.trap_pdu_1 || '',
    trapFlag: raw.trap_flag || 0,
    suppressionPeriod: raw.suppression_period || 0,
    programModules: parseProgramModules(raw.program_modules),
  };
}

/**
 * Parse program modules array
 */
function parseProgramModules(raw?: RawProgramModule[]): ProgramModule[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((module) => ({
    type: module.type,
    x: module.x,
    y: module.y,
    name: module.name,
    inputs: module.inputs,
    classes: module.classes,
    parameters: module.parameters,
  }));
}

/**
 * Parse a single class
 */
function parseClass(
  raw: RawClass,
  disciplineName: string,
  disciplineTypeName: string
): ParsedClass {
  return {
    disciplineName,
    disciplineTypeName,
    classId: raw.id || '',
    description: raw.description || '',
    defaultFlag: raw.default_flag || 0,
    data: Array.isArray(raw.data) ? raw.data : null,
    patterns: Array.isArray(raw.patterns) ? raw.patterns : null,
  };
}

/**
 * Parse a single field
 */
function parseField(
  raw: RawField,
  disciplineName: string,
  disciplineTypeName: string
): ParsedField {
  return {
    disciplineName,
    disciplineTypeName,
    name: raw.name || '',
    arrayType: raw.array_type || null,
    arraySize: raw.array_size ?? null,
    fieldType1: raw.field_type_1 || null,
    fieldType2: raw.field_type_2 || null,
  };
}

/**
 * Merge multiple parsed configs (for importing multiple JSON files)
 */
export function mergeConfigs(...configs: ParsedConfig[]): ParsedConfig {
  const merged: ParsedConfig = {
    disciplines: [],
    disciplineTypes: [],
    alarmPatterns: [],
    classes: [],
    fields: [],
  };

  const disciplineSet = new Set<string>();
  const disciplineTypeSet = new Set<string>();

  for (const config of configs) {
    // Deduplicate disciplines by name
    for (const discipline of config.disciplines) {
      if (!disciplineSet.has(discipline.name)) {
        disciplineSet.add(discipline.name);
        merged.disciplines.push(discipline);
      }
    }

    // Deduplicate discipline types by composite key
    for (const type of config.disciplineTypes) {
      const key = `${type.disciplineName}:${type.name}`;
      if (!disciplineTypeSet.has(key)) {
        disciplineTypeSet.add(key);
        merged.disciplineTypes.push(type);
      }
    }

    // Merge all alarm patterns, classes, and fields
    merged.alarmPatterns.push(...config.alarmPatterns);
    merged.classes.push(...config.classes);
    merged.fields.push(...config.fields);
  }

  return merged;
}
