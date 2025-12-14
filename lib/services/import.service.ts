/**
 * Import Service
 * Handles parsing and importing JSON configuration files
 */

import { parseConfigJson, mergeConfigs, type ParsedConfig } from '../utils/parser.js';
import { DisciplineRepository, DisciplineTypeRepository } from '../repositories/discipline.repository.js';
import { AlarmFlowRepository } from '../repositories/alarm-flow.repository.js';
import { ClassRepository, FieldRepository } from '../repositories/class.repository.js';
import type { ImportSummaryDTO, ImportErrorDetail } from '../types/dtos.js';
import { stringifyProgramModules } from '../types/program-modules.js';
import { ImportError as ImportErrorClass, ConflictError } from '../utils/errors.js';

/**
 * Import result tracking
 */
interface ImportResult {
  disciplinesCreated: number;
  disciplineTypesCreated: number;
  alarmPatternsCreated: number;
  classesCreated: number;
  fieldsCreated: number;
  errors: ImportErrorDetail[];
}

/**
 * ID mapping for resolving references
 */
interface IdMapping {
  disciplines: Map<string, string>; // name -> $id
  disciplineTypes: Map<string, string>; // "disciplineName:typeName" -> $id
}

/**
 * Import Service Class
 */
export class ImportService {
  private disciplineRepo: DisciplineRepository;
  private disciplineTypeRepo: DisciplineTypeRepository;
  private alarmFlowRepo: AlarmFlowRepository;
  private classRepo: ClassRepository;
  private fieldRepo: FieldRepository;

  constructor() {
    this.disciplineRepo = new DisciplineRepository();
    this.disciplineTypeRepo = new DisciplineTypeRepository();
    this.alarmFlowRepo = new AlarmFlowRepository();
    this.classRepo = new ClassRepository();
    this.fieldRepo = new FieldRepository();
  }

  /**
   * Import a single JSON configuration
   */
  async importConfig(jsonContent: string, overwriteExisting: boolean = false): Promise<ImportSummaryDTO> {
    const parsed = parseConfigJson(jsonContent);
    return this.importParsedConfig(parsed, overwriteExisting);
  }

  /**
   * Import multiple JSON configurations
   */
  async importMultipleConfigs(
    jsonContents: string[],
    overwriteExisting: boolean = false
  ): Promise<ImportSummaryDTO> {
    const configs = jsonContents.map(content => parseConfigJson(content));
    const merged = mergeConfigs(...configs);
    return this.importParsedConfig(merged, overwriteExisting);
  }

  /**
   * Import parsed configuration data
   */
  private async importParsedConfig(
    parsed: ParsedConfig,
    overwriteExisting: boolean
  ): Promise<ImportSummaryDTO> {
    const result: ImportResult = {
      disciplinesCreated: 0,
      disciplineTypesCreated: 0,
      alarmPatternsCreated: 0,
      classesCreated: 0,
      fieldsCreated: 0,
      errors: [],
    };

    const idMapping: IdMapping = {
      disciplines: new Map(),
      disciplineTypes: new Map(),
    };

    // Phase 1: Import disciplines
    await this.importDisciplines(parsed, result, idMapping, overwriteExisting);

    // Phase 2: Import discipline types
    await this.importDisciplineTypes(parsed, result, idMapping, overwriteExisting);

    // Phase 3: Import alarm patterns
    await this.importAlarmPatterns(parsed, result, idMapping, overwriteExisting);

    // Phase 4: Import classes
    await this.importClasses(parsed, result, idMapping, overwriteExisting);

    // Phase 5: Import fields
    await this.importFields(parsed, result, idMapping, overwriteExisting);

    return result;
  }

  /**
   * Import disciplines
   */
  private async importDisciplines(
    parsed: ParsedConfig,
    result: ImportResult,
    idMapping: IdMapping,
    overwriteExisting: boolean
  ): Promise<void> {
    for (const discipline of parsed.disciplines) {
      try {
        // Check if exists
        const existing = await this.disciplineRepo.findByName(discipline.name);

        if (existing) {
          if (overwriteExisting) {
            await this.disciplineRepo.updateDiscipline(existing.$id, {
              enterpriseName: discipline.enterpriseName,
              enterpriseVersion: discipline.enterpriseVersion,
            });
          }
          idMapping.disciplines.set(discipline.name, existing.$id);
        } else {
          const created = await this.disciplineRepo.createDiscipline({
            name: discipline.name,
            enterpriseName: discipline.enterpriseName,
            enterpriseVersion: discipline.enterpriseVersion,
          });
          idMapping.disciplines.set(discipline.name, created.$id);
          result.disciplinesCreated++;
        }
      } catch (error) {
        result.errors.push({
          type: 'discipline',
          name: discipline.name,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Import discipline types
   */
  private async importDisciplineTypes(
    parsed: ParsedConfig,
    result: ImportResult,
    idMapping: IdMapping,
    overwriteExisting: boolean
  ): Promise<void> {
    for (const type of parsed.disciplineTypes) {
      try {
        const disciplineId = idMapping.disciplines.get(type.disciplineName);
        if (!disciplineId) {
          result.errors.push({
            type: 'disciplineType',
            name: type.name,
            message: `Parent discipline '${type.disciplineName}' not found`,
          });
          continue;
        }

        const key = `${type.disciplineName}:${type.name}`;
        const existing = await this.disciplineTypeRepo.findByDisciplineAndName(
          disciplineId,
          type.name
        );

        if (existing) {
          idMapping.disciplineTypes.set(key, existing.$id);
        } else {
          const created = await this.disciplineTypeRepo.createDisciplineType({
            disciplineId,
            name: type.name,
          });
          idMapping.disciplineTypes.set(key, created.$id);
          result.disciplineTypesCreated++;
        }
      } catch (error) {
        result.errors.push({
          type: 'disciplineType',
          name: type.name,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Import alarm patterns
   */
  private async importAlarmPatterns(
    parsed: ParsedConfig,
    result: ImportResult,
    idMapping: IdMapping,
    overwriteExisting: boolean
  ): Promise<void> {
    for (const pattern of parsed.alarmPatterns) {
      try {
        const key = `${pattern.disciplineName}:${pattern.disciplineTypeName}`;
        const disciplineTypeId = idMapping.disciplineTypes.get(key);

        if (!disciplineTypeId) {
          result.errors.push({
            type: 'alarmPattern',
            name: pattern.alarmId,
            message: `Parent discipline type '${key}' not found`,
          });
          continue;
        }

        const alarmPatternKey = this.alarmFlowRepo.generateAlarmPatternKey(
          disciplineTypeId,
          pattern.alarmId
        );

        const existing = await this.alarmFlowRepo.findLatestByKey(alarmPatternKey);

        if (existing) {
          if (overwriteExisting) {
            // Create new version
            await this.alarmFlowRepo.createNewVersion(alarmPatternKey, {
              textExpr: pattern.textExpr,
              genericFamily: pattern.genericFamily,
              genericId: pattern.genericId,
              trapPdu1: pattern.trapPdu1,
              trapFlag: pattern.trapFlag,
              suppressionPeriod: pattern.suppressionPeriod,
              programModules: pattern.programModules,
              changeDescription: 'Updated via import',
              updatedBy: 'import-service',
            });
            result.alarmPatternsCreated++;
          }
        } else {
          await this.alarmFlowRepo.createAlarmPattern({
            disciplineTypeId,
            no: pattern.no,
            alarmId: pattern.alarmId,
            textExpr: pattern.textExpr,
            genericFamily: pattern.genericFamily,
            genericId: pattern.genericId,
            trapPdu1: pattern.trapPdu1,
            trapFlag: pattern.trapFlag,
            suppressionPeriod: pattern.suppressionPeriod,
            programModules: pattern.programModules,
            createdBy: 'import-service',
          });
          result.alarmPatternsCreated++;
        }
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          result.errors.push({
            type: 'alarmPattern',
            name: pattern.alarmId,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }
  }

  /**
   * Import classes
   */
  private async importClasses(
    parsed: ParsedConfig,
    result: ImportResult,
    idMapping: IdMapping,
    overwriteExisting: boolean
  ): Promise<void> {
    for (const cls of parsed.classes) {
      try {
        const key = `${cls.disciplineName}:${cls.disciplineTypeName}`;
        const disciplineTypeId = idMapping.disciplineTypes.get(key);

        if (!disciplineTypeId) {
          result.errors.push({
            type: 'class',
            name: cls.classId,
            message: `Parent discipline type '${key}' not found`,
          });
          continue;
        }

        const existing = await this.classRepo.findByDisciplineTypeAndClassId(
          disciplineTypeId,
          cls.classId
        );

        if (existing) {
          if (overwriteExisting) {
            await this.classRepo.updateClass(existing.$id, {
              description: cls.description,
              defaultFlag: cls.defaultFlag,
              data: cls.data || undefined,
              patterns: cls.patterns || undefined,
            });
          }
        } else {
          await this.classRepo.createClass({
            disciplineTypeId,
            classId: cls.classId,
            description: cls.description,
            defaultFlag: cls.defaultFlag,
            data: cls.data || undefined,
            patterns: cls.patterns || undefined,
          });
          result.classesCreated++;
        }
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          result.errors.push({
            type: 'class',
            name: cls.classId,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }
  }

  /**
   * Import fields
   */
  private async importFields(
    parsed: ParsedConfig,
    result: ImportResult,
    idMapping: IdMapping,
    overwriteExisting: boolean
  ): Promise<void> {
    for (const field of parsed.fields) {
      try {
        const key = `${field.disciplineName}:${field.disciplineTypeName}`;
        const disciplineTypeId = idMapping.disciplineTypes.get(key);

        if (!disciplineTypeId) {
          result.errors.push({
            type: 'field',
            name: field.name,
            message: `Parent discipline type '${key}' not found`,
          });
          continue;
        }

        const existing = await this.fieldRepo.findByDisciplineTypeAndName(
          disciplineTypeId,
          field.name
        );

        if (!existing) {
          await this.fieldRepo.createField({
            disciplineTypeId,
            name: field.name,
            arrayType: field.arrayType || undefined,
            arraySize: field.arraySize || undefined,
            fieldType1: field.fieldType1 || undefined,
            fieldType2: field.fieldType2 || undefined,
          });
          result.fieldsCreated++;
        }
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          result.errors.push({
            type: 'field',
            name: field.name,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }
  }
}

export default ImportService;
