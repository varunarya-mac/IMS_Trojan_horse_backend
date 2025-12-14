/**
 * Alarm Flow Repository
 * Handles data access for alarm patterns with versioning support
 */

import { Query } from 'node-appwrite';
import { BaseRepository, type QueryOptions, type PaginatedResult } from './base.repository.js';
import { COLLECTION_IDS, type AlarmPatternEntity } from '../types/entities.js';
import type { AlarmPatternDTO, AlarmFlowDTO, AlarmVersionDTO, AlarmFlowsListDTO } from '../types/dtos.js';
import type { ProgramModule } from '../types/program-modules.js';
import { parseProgramModules, stringifyProgramModules } from '../types/program-modules.js';
import { DisciplineRepository, DisciplineTypeRepository } from './discipline.repository.js';
import { ClassRepository } from './class.repository.js';
import { NotFoundError, ConflictError, DatabaseError } from '../utils/errors.js';
import { generateId } from '../utils/db.js';

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
  constructor() {
    super(COLLECTION_IDS.ALARM_PATTERNS);
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
    const result = await this.findWhere([
      Query.equal('disciplineTypeId', disciplineTypeId),
      Query.equal('isLatest', true),
    ], { limit: 1000 });
    return result.documents;
  }

  /**
   * Find the latest version of an alarm pattern by its key
   */
  async findLatestByKey(alarmPatternKey: string): Promise<AlarmPatternEntity | null> {
    return this.findOneWhere([
      Query.equal('alarmPatternKey', alarmPatternKey),
      Query.equal('isLatest', true),
    ]);
  }

  /**
   * Find the latest version or throw
   */
  async findLatestByKeyOrFail(alarmPatternKey: string): Promise<AlarmPatternEntity> {
    const pattern = await this.findLatestByKey(alarmPatternKey);
    if (!pattern) {
      throw new NotFoundError('Alarm Pattern', alarmPatternKey);
    }
    return pattern;
  }

  /**
   * Find a specific version of an alarm pattern
   */
  async findSpecificVersion(alarmPatternKey: string, version: number): Promise<AlarmPatternEntity | null> {
    return this.findOneWhere([
      Query.equal('alarmPatternKey', alarmPatternKey),
      Query.equal('version', version),
    ]);
  }

  /**
   * Get all versions of an alarm pattern (version history)
   */
  async findVersionHistory(alarmPatternKey: string): Promise<AlarmPatternEntity[]> {
    const result = await this.findWhere(
      [Query.equal('alarmPatternKey', alarmPatternKey)],
      { orderBy: 'version', orderDirection: 'desc', limit: 100 }
    );
    return result.documents;
  }

  /**
   * Get the current version number for an alarm pattern key
   */
  async getCurrentVersion(alarmPatternKey: string): Promise<number> {
    const latest = await this.findLatestByKey(alarmPatternKey);
    return latest ? latest.version : 0;
  }

  /**
   * Create a new alarm pattern (version 1)
   */
  async createAlarmPattern(input: CreateAlarmPatternInput): Promise<AlarmPatternEntity> {
    const alarmPatternKey = this.generateAlarmPatternKey(input.disciplineTypeId, input.alarmId);

    // Check if alarm pattern already exists
    const existing = await this.findLatestByKey(alarmPatternKey);
    if (existing) {
      throw new ConflictError(`Alarm pattern '${input.alarmId}' already exists`);
    }

    const now = new Date().toISOString();

    return this.create({
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
  }

  /**
   * Create a new version of an alarm pattern
   */
  async createNewVersion(
    alarmPatternKey: string,
    updates: UpdateAlarmPatternInput
  ): Promise<AlarmPatternEntity> {
    // Get current latest version
    const current = await this.findLatestByKeyOrFail(alarmPatternKey);

    // Mark current as not latest
    await this.update(current.$id, { isLatest: false });

    const now = new Date().toISOString();
    const newVersion = current.version + 1;

    // Create new version with merged data
    return this.create({
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
    return this.create({
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
  }

  /**
   * Soft delete an alarm pattern (mark all versions as not latest)
   */
  async softDelete(alarmPatternKey: string): Promise<void> {
    const versions = await this.findVersionHistory(alarmPatternKey);

    for (const version of versions) {
      if (version.isLatest) {
        await this.update(version.$id, { isLatest: false });
      }
    }
  }

  /**
   * Get alarm flows with full context for a discipline type
   */
  async getAlarmFlowsWithContext(disciplineTypeId: string): Promise<AlarmFlowsListDTO> {
    const disciplineTypeRepo = new DisciplineTypeRepository();
    const disciplineRepo = new DisciplineRepository();
    const classRepo = new ClassRepository();

    // Get discipline type and parent discipline
    const disciplineType = await disciplineTypeRepo.findByIdOrFail(disciplineTypeId, 'Discipline Type');
    const discipline = await disciplineRepo.findByIdOrFail(disciplineType.disciplineId, 'Discipline');

    // Get latest alarms and classes in parallel
    const [alarms, classResult] = await Promise.all([
      this.findLatestByDisciplineType(disciplineTypeId),
      classRepo.findByDisciplineType(disciplineTypeId),
    ]);

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
  }

  /**
   * Get version history with DTOs
   */
  async getVersionHistoryDTO(alarmPatternKey: string): Promise<AlarmVersionDTO[]> {
    const versions = await this.findVersionHistory(alarmPatternKey);

    return versions.map(v => ({
      version: v.version,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      changeDescription: v.changeDescription,
      isLatest: v.isLatest,
      alarm: this.toDTO(v),
    }));
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
