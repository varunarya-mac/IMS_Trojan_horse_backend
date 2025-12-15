/**
 * Alarm Flow Repository
 * Handles data access for alarm patterns with versioning support
 */

import { Query } from 'node-appwrite';
import { BaseRepository, type QueryOptions, type PaginatedResult } from './base.repository.js';
import { COLLECTION_IDS, type AlarmPatternEntity } from '../types/entities.js';
import type { AlarmPatternDTO, AlarmFlowDTO, AlarmVersionDTO, AlarmFlowsListDTO, AlarmFlowsByDisciplineDTO } from '../types/dtos.js';
import type { ProgramModule } from '../types/program-modules.js';
import { parseProgramModules, stringifyProgramModules } from '../types/program-modules.js';
import { DisciplineRepository, DisciplineTypeRepository } from './discipline.repository.js';
import { ClassRepository } from './class.repository.js';
import { NotFoundError, ConflictError, DatabaseError } from '../utils/errors.js';
import { generateId } from '../utils/db.js';
import type { Logger } from '../types/logger.js';

/**
 * Input data for creating a new alarm pattern
 */
export interface CreateAlarmPatternInput {
  disciplineTypeId: string;
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
 * Input data for updating an alarm pattern
 */
export interface UpdateAlarmPatternInput {
  textExpr?: string;
  genericFamily?: string;
  genericId?: string;
  trapPdu1?: string;
  trapFlag?: number;
  suppressionPeriod?: number;
  programModules?: ProgramModule[];
  changeDescription: string;
  updatedBy: string;
}

/**
 * Repository for managing alarm patterns with versioning
 */
export class AlarmFlowRepository extends BaseRepository<AlarmPatternEntity> {
  constructor(logger?: Logger) {
    super(COLLECTION_IDS.ALARM_PATTERNS, logger);
  }

  /**
   * Generate alarm pattern key from discipline type ID and alarm ID
   */
  generateAlarmPatternKey(disciplineTypeId: string, alarmId: string): string {
    return `${disciplineTypeId}_${alarmId}`;
  }

  /**
   * Find all latest alarm patterns for a discipline type
   */
  async findLatestByDisciplineType(disciplineTypeId: string): Promise<AlarmPatternEntity[]> {
    try {
      const result = await this.findWhere([
        Query.equal('disciplineTypeId', disciplineTypeId),
        Query.equal('isLatest', true),
      ], { limit: 1000 });
      return result.documents;
    } catch (error) {
      throw new DatabaseError(`Failed to find latest alarm patterns for discipline type: ${disciplineTypeId}`, { error });
    }
  }

  /**
   * Find the latest version of an alarm pattern by its key
   */
  async findLatestByKey(alarmPatternKey: string): Promise<AlarmPatternEntity | null> {
    try {
      this.logger.log(`[AlarmFlowRepository] Finding latest alarm pattern: ${alarmPatternKey}`);
      return await this.findOneWhere([
        Query.equal('alarmPatternKey', alarmPatternKey),
        Query.equal('isLatest', true),
      ]);
    } catch (error) {
      this.logger.error(`[AlarmFlowRepository] Error finding alarm pattern '${alarmPatternKey}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new DatabaseError(`Failed to find latest alarm pattern by key: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Find the latest version or throw
   */
  async findLatestByKeyOrFail(alarmPatternKey: string): Promise<AlarmPatternEntity> {
    try {
      const pattern = await this.findLatestByKey(alarmPatternKey);
      if (!pattern) {
        throw new NotFoundError('Alarm Pattern', alarmPatternKey);
      }
      return pattern;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to find latest alarm pattern by key: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Find a specific version of an alarm pattern
   */
  async findSpecificVersion(alarmPatternKey: string, version: number): Promise<AlarmPatternEntity | null> {
    try {
      return await this.findOneWhere([
        Query.equal('alarmPatternKey', alarmPatternKey),
        Query.equal('version', version),
      ]);
    } catch (error) {
      throw new DatabaseError(`Failed to find alarm pattern version ${version} for key: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Get all versions of an alarm pattern (version history)
   */
  async findVersionHistory(alarmPatternKey: string): Promise<AlarmPatternEntity[]> {
    try {
      const result = await this.findWhere(
        [Query.equal('alarmPatternKey', alarmPatternKey)],
        { orderBy: 'version', orderDirection: 'desc', limit: 100 }
      );
      return result.documents;
    } catch (error) {
      throw new DatabaseError(`Failed to find version history for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Get the current version number for an alarm pattern key
   */
  async getCurrentVersion(alarmPatternKey: string): Promise<number> {
    try {
      const latest = await this.findLatestByKey(alarmPatternKey);
      return latest ? latest.version : 0;
    } catch (error) {
      throw new DatabaseError(`Failed to get current version for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Create a new alarm pattern (version 1)
   */
  async createAlarmPattern(input: CreateAlarmPatternInput): Promise<AlarmPatternEntity> {
    try {
      const alarmPatternKey = this.generateAlarmPatternKey(input.disciplineTypeId, input.alarmId);
      this.logger.log(`[AlarmFlowRepository] Creating alarm pattern: ${input.alarmId} (key: ${alarmPatternKey})`);

      // Check if alarm pattern already exists
      const existing = await this.findLatestByKey(alarmPatternKey);
      if (existing) {
        throw new ConflictError(`Alarm pattern '${input.alarmId}' already exists`);
      }

      const now = new Date().toISOString();

      const result = await this.create({
        disciplineTypeId: input.disciplineTypeId,
        alarmPatternKey,
        version: 1,
        isLatest: true,
        no: input.no,
        alarmId: input.alarmId,
        textExpr: input.textExpr,
        genericFamily: input.genericFamily,
        genericId: input.genericId,
        trapPdu1: input.trapPdu1,
        trapFlag: input.trapFlag,
        suppressionPeriod: input.suppressionPeriod,
        programModules: input.programModules ? stringifyProgramModules(input.programModules) : null,
        createdAt: now,
        createdBy: input.createdBy || null,
        changeDescription: 'Initial version',
      });

      this.logger.log(`[AlarmFlowRepository] Created alarm pattern: ${input.alarmId} (ID: ${result.$id}, version: 1)`);
      return result;
    } catch (error) {
      this.logger.error(`[AlarmFlowRepository] Error creating alarm pattern '${input.alarmId}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (error instanceof ConflictError) throw error;
      throw new DatabaseError(`Failed to create alarm pattern: ${input.alarmId}`, { error });
    }
  }

  /**
   * Create a new version of an alarm pattern
   */
  async createNewVersion(
    alarmPatternKey: string,
    updates: UpdateAlarmPatternInput
  ): Promise<AlarmPatternEntity> {
    try {
      this.logger.log(`[AlarmFlowRepository] Creating new version for alarm pattern: ${alarmPatternKey}`);

      // Get current latest version
      const current = await this.findLatestByKeyOrFail(alarmPatternKey);
      const newVersion = current.version + 1;

      // Mark current as not latest
      await this.update(current.$id, { isLatest: false });

      const now = new Date().toISOString();

      // Create new version with merged data
      const result = await this.create({
        disciplineTypeId: current.disciplineTypeId,
        alarmPatternKey,
        version: newVersion,
        isLatest: true,
        no: current.no,
        alarmId: current.alarmId,
        textExpr: updates.textExpr ?? current.textExpr,
        genericFamily: updates.genericFamily ?? current.genericFamily,
        genericId: updates.genericId ?? current.genericId,
        trapPdu1: updates.trapPdu1 ?? current.trapPdu1,
        trapFlag: updates.trapFlag ?? current.trapFlag,
        suppressionPeriod: updates.suppressionPeriod ?? current.suppressionPeriod,
        programModules: updates.programModules
          ? stringifyProgramModules(updates.programModules)
          : current.programModules,
        createdAt: now,
        createdBy: updates.updatedBy,
        changeDescription: updates.changeDescription,
      });

      this.logger.log(`[AlarmFlowRepository] Created new version ${newVersion} for alarm pattern: ${alarmPatternKey} (ID: ${result.$id})`);
      return result;
    } catch (error) {
      this.logger.error(`[AlarmFlowRepository] Error creating new version for '${alarmPatternKey}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to create new version for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Rollback to a specific version
   */
  async rollbackToVersion(
    alarmPatternKey: string,
    targetVersion: number,
    rollbackBy: string,
    reason?: string
  ): Promise<AlarmPatternEntity> {
    try {
      // Get the target version
      const target = await this.findSpecificVersion(alarmPatternKey, targetVersion);
      if (!target) {
        throw new NotFoundError('Alarm Pattern Version', `${alarmPatternKey} v${targetVersion}`);
      }

      // Get current version
      const current = await this.findLatestByKeyOrFail(alarmPatternKey);

      // Mark current as not latest
      await this.update(current.$id, { isLatest: false });

      const now = new Date().toISOString();
      const newVersion = current.version + 1;

      // Create new version copying data from target
      return await this.create({
        disciplineTypeId: target.disciplineTypeId,
        alarmPatternKey,
        version: newVersion,
        isLatest: true,
        no: target.no,
        alarmId: target.alarmId,
        textExpr: target.textExpr,
        genericFamily: target.genericFamily,
        genericId: target.genericId,
        trapPdu1: target.trapPdu1,
        trapFlag: target.trapFlag,
        suppressionPeriod: target.suppressionPeriod,
        programModules: target.programModules,
        createdAt: now,
        createdBy: rollbackBy,
        changeDescription: reason || `Rollback to version ${targetVersion}`,
      });
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to rollback alarm pattern ${alarmPatternKey} to version ${targetVersion}`, { error });
    }
  }

  /**
   * Soft delete an alarm pattern (mark all versions as not latest)
   */
  async softDelete(alarmPatternKey: string): Promise<void> {
    try {
      const versions = await this.findVersionHistory(alarmPatternKey);

      for (const version of versions) {
        if (version.isLatest) {
          await this.update(version.$id, { isLatest: false });
        }
      }
    } catch (error) {
      throw new DatabaseError(`Failed to soft delete alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Get alarm flows with full context for a discipline type
   */
  async getAlarmFlowsWithContext(disciplineTypeId: string): Promise<AlarmFlowsListDTO> {
    try {
      this.logger.log(`[AlarmFlowRepository] Getting alarm flows with context for discipline type: ${disciplineTypeId}`);

      // Pass logger to child repositories
      const disciplineTypeRepo = new DisciplineTypeRepository(this.logger);
      const disciplineRepo = new DisciplineRepository(this.logger);
      const classRepo = new ClassRepository(this.logger);

      // Get discipline type and parent discipline
      const disciplineType = await disciplineTypeRepo.findByIdOrFail(disciplineTypeId, 'Discipline Type');
      const discipline = await disciplineRepo.findByIdOrFail(disciplineType.disciplineId, 'Discipline');

      // Get latest alarms and classes in parallel
      const [alarms, classResult] = await Promise.all([
        this.findLatestByDisciplineType(disciplineTypeId),
        classRepo.findByDisciplineType(disciplineTypeId),
      ]);

      this.logger.log(`[AlarmFlowRepository] Retrieved ${alarms.length} alarms and ${classResult.documents.length} classes`);

      return {
        discipline: {
          id: discipline.$id,
          name: discipline.name,
        },
        disciplineType: {
          id: disciplineType.$id,
          name: disciplineType.name,
        },
        alarms: alarms.map(alarm => this.toDTO(alarm)),
        classes: classResult.documents.map(cls => classRepo.toDTO(cls)),
      };
    } catch (error) {
      this.logger.error(`[AlarmFlowRepository] Error getting alarm flows with context: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to get alarm flows with context for discipline type: ${disciplineTypeId}`, { error });
    }
  }

  /**
   * Get alarm flows grouped by discipline
   */
  async getAlarmFlowsByDiscipline(disciplineId: string): Promise<AlarmFlowsByDisciplineDTO> {
    try {
      this.logger.log(`[AlarmFlowRepository] Getting alarm flows for discipline: ${disciplineId}`);

      const disciplineRepo = new DisciplineRepository(this.logger);
      const disciplineTypeRepo = new DisciplineTypeRepository(this.logger);
      const classRepo = new ClassRepository(this.logger);

      // Get discipline
      const discipline = await disciplineRepo.findByIdOrFail(disciplineId, 'Discipline');

      // Get all discipline types for this discipline
      const { documents: disciplineTypes } = await disciplineTypeRepo.findByDisciplineId(disciplineId);

      // For each discipline type, get alarms and classes
      const disciplineTypesData = await Promise.all(
        disciplineTypes.map(async (dt) => {
          const [alarms, classResult] = await Promise.all([
            this.findLatestByDisciplineType(dt.$id),
            classRepo.findByDisciplineType(dt.$id),
          ]);

          return {
            disciplineType: { id: dt.$id, name: dt.name },
            alarms: alarms.map(a => this.toDTO(a)),
            classes: classResult.documents.map(c => classRepo.toDTO(c)),
          };
        })
      );

      this.logger.log(`[AlarmFlowRepository] Found ${disciplineTypesData.length} discipline types for discipline: ${disciplineId}`);

      return {
        discipline: { id: discipline.$id, name: discipline.name },
        disciplineTypes: disciplineTypesData,
      };
    } catch (error) {
      this.logger.error(`[AlarmFlowRepository] Error getting alarm flows for discipline: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to get alarm flows for discipline: ${disciplineId}`, { error });
    }
  }

  /**
   * Get all alarm flows grouped by discipline
   */
  async getAllAlarmFlows(): Promise<AlarmFlowsByDisciplineDTO[]> {
    try {
      this.logger.log('[AlarmFlowRepository] Getting all alarm flows');

      const disciplineRepo = new DisciplineRepository(this.logger);
      const { documents: disciplines } = await disciplineRepo.findAll({ limit: 100 });

      const result = await Promise.all(
        disciplines.map(d => this.getAlarmFlowsByDiscipline(d.$id))
      );

      this.logger.log(`[AlarmFlowRepository] Retrieved alarm flows for ${result.length} disciplines`);

      return result;
    } catch (error) {
      this.logger.error(`[AlarmFlowRepository] Error getting all alarm flows: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new DatabaseError('Failed to get all alarm flows', { error });
    }
  }

  /**
   * Get version history with DTOs
   */
  async getVersionHistoryDTO(alarmPatternKey: string): Promise<AlarmVersionDTO[]> {
    try {
      const versions = await this.findVersionHistory(alarmPatternKey);

      return versions.map(v => ({
        version: v.version,
        createdAt: v.createdAt,
        createdBy: v.createdBy,
        changeDescription: v.changeDescription,
        isLatest: v.isLatest,
        alarm: this.toDTO(v),
      }));
    } catch (error) {
      throw new DatabaseError(`Failed to get version history DTO for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Convert entity to DTO with parsed program modules
   */
  toDTO(entity: AlarmPatternEntity): AlarmPatternDTO {
    return {
      id: entity.$id,
      disciplineTypeId: entity.disciplineTypeId,
      alarmPatternKey: entity.alarmPatternKey,
      version: entity.version,
      isLatest: entity.isLatest,
      no: entity.no,
      alarmId: entity.alarmId,
      textExpr: entity.textExpr,
      genericFamily: entity.genericFamily,
      genericId: entity.genericId,
      trapPdu1: entity.trapPdu1,
      trapFlag: entity.trapFlag,
      suppressionPeriod: entity.suppressionPeriod,
      programModules: parseProgramModules(entity.programModules),
      createdAt: entity.createdAt,
      createdBy: entity.createdBy,
      changeDescription: entity.changeDescription,
    };
  }
}

export default AlarmFlowRepository;
