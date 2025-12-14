/**
 * Discipline Repository
 * Handles data access for disciplines and discipline types
 */

import { Query } from 'node-appwrite';
import { BaseRepository, type QueryOptions, type PaginatedResult } from './base.repository.js';
import { COLLECTION_IDS, type DisciplineEntity, type DisciplineTypeEntity } from '../types/entities.js';
import type { DisciplineDTO, DisciplineTypeDTO } from '../types/dtos.js';
import { getDatabases, getDatabaseId, generateId } from '../utils/db.js';
import { ConflictError, DatabaseError, NotFoundError } from '../utils/errors.js';
import { log } from '../utils/logger.js';

/**
 * Repository for managing disciplines
 */
export class DisciplineRepository extends BaseRepository<DisciplineEntity> {
  constructor() {
    super(COLLECTION_IDS.DISCIPLINES);
  }

  /**
   * Find discipline by name
   */
  async findByName(name: string): Promise<DisciplineEntity | null> {
    return this.findOneWhere([Query.equal('name', name)]);
  }

  /**
   * Find discipline by name or throw
   */
  async findByNameOrFail(name: string): Promise<DisciplineEntity> {
    const discipline = await this.findByName(name);
    if (!discipline) {
      throw new NotFoundError('Discipline', name);
    }
    return discipline;
  }

  /**
   * Get all disciplines with their types
   */
  async findAllWithTypes(): Promise<DisciplineDTO[]> {
    const disciplineTypeRepo = new DisciplineTypeRepository();

    const { documents: disciplines } = await this.findAll({ limit: 100 });
    log(`[DisciplineRepository] Found ${disciplines.length} disciplines`);

    const result: DisciplineDTO[] = [];
    log(`[DisciplineRepository] Starting to process ${disciplines.length} disciplines`);

    for (const discipline of disciplines) {
      const { documents: types } = await disciplineTypeRepo.findByDisciplineId(discipline.$id);

      result.push({
        id: discipline.$id,
        name: discipline.name,
        enterpriseName: discipline.enterpriseName,
        enterpriseVersion: discipline.enterpriseVersion,
        createdAt: discipline.createdAt,
        updatedAt: discipline.updatedAt,
        types: types.map(type => ({
          id: type.$id,
          disciplineId: type.disciplineId,
          name: type.name,
          createdAt: type.createdAt,
        })),
      });
    }

    log(`[DisciplineRepository] Successfully processed ${result.length} disciplines with types`);
    return result;
  }

  /**
   * Create discipline with validation
   */
  async createDiscipline(data: {
    name: string;
    enterpriseName: string;
    enterpriseVersion: number;
  }): Promise<DisciplineEntity> {
    // Check if discipline with same name exists
    const existing = await this.findByName(data.name);
    if (existing) {
      throw new ConflictError(`Discipline with name '${data.name}' already exists`);
    }

    const now = new Date().toISOString();
    return this.create({
      ...data,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Update discipline
   */
  async updateDiscipline(id: string, data: Partial<{
    name: string;
    enterpriseName: string;
    enterpriseVersion: number;
  }>): Promise<DisciplineEntity> {
    // Verify discipline exists
    await this.findByIdOrFail(id, 'Discipline');

    // If name is being changed, check for conflicts
    if (data.name) {
      const existing = await this.findByName(data.name);
      if (existing && existing.$id !== id) {
        throw new ConflictError(`Discipline with name '${data.name}' already exists`);
      }
    }

    return this.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Convert entity to DTO
   */
  toDTO(entity: DisciplineEntity): DisciplineDTO {
    return {
      id: entity.$id,
      name: entity.name,
      enterpriseName: entity.enterpriseName,
      enterpriseVersion: entity.enterpriseVersion,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

/**
 * Repository for managing discipline types
 */
export class DisciplineTypeRepository extends BaseRepository<DisciplineTypeEntity> {
  constructor() {
    super(COLLECTION_IDS.DISCIPLINE_TYPES);
  }

  /**
   * Find all types for a discipline
   */
  async findByDisciplineId(disciplineId: string): Promise<PaginatedResult<DisciplineTypeEntity>> {
    return this.findWhere([Query.equal('disciplineId', disciplineId)], { limit: 100 });
  }

  /**
   * Find type by discipline ID and name
   */
  async findByDisciplineAndName(disciplineId: string, name: string): Promise<DisciplineTypeEntity | null> {
    return this.findOneWhere([
      Query.equal('disciplineId', disciplineId),
      Query.equal('name', name),
    ]);
  }

  /**
   * Find type by name across all disciplines
   */
  async findByName(name: string): Promise<DisciplineTypeEntity[]> {
    const result = await this.findWhere([Query.equal('name', name)], { limit: 100 });
    return result.documents;
  }

  /**
   * Get discipline type with parent discipline info
   */
  async findWithDiscipline(typeId: string): Promise<DisciplineTypeDTO | null> {
    const type = await this.findById(typeId);
    if (!type) return null;

    const disciplineRepo = new DisciplineRepository();
    const discipline = await disciplineRepo.findById(type.disciplineId);

    return {
      id: type.$id,
      disciplineId: type.disciplineId,
      name: type.name,
      createdAt: type.createdAt,
      discipline: discipline ? {
        id: discipline.$id,
        name: discipline.name,
      } : undefined,
    };
  }

  /**
   * Create discipline type with validation
   */
  async createDisciplineType(data: {
    disciplineId: string;
    name: string;
  }): Promise<DisciplineTypeEntity> {
    // Check if type with same name exists under this discipline
    const existing = await this.findByDisciplineAndName(data.disciplineId, data.name);
    if (existing) {
      throw new ConflictError(
        `Discipline type '${data.name}' already exists under this discipline`
      );
    }

    return this.create({
      ...data,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Get all types for a discipline with discipline info
   */
  async findByDisciplineIdWithContext(disciplineId: string): Promise<DisciplineTypeDTO[]> {
    const disciplineRepo = new DisciplineRepository();
    const discipline = await disciplineRepo.findById(disciplineId);

    const { documents: types } = await this.findByDisciplineId(disciplineId);

    return types.map(type => ({
      id: type.$id,
      disciplineId: type.disciplineId,
      name: type.name,
      createdAt: type.createdAt,
      discipline: discipline ? {
        id: discipline.$id,
        name: discipline.name,
      } : undefined,
    }));
  }

  /**
   * Convert entity to DTO
   */
  toDTO(entity: DisciplineTypeEntity): DisciplineTypeDTO {
    return {
      id: entity.$id,
      disciplineId: entity.disciplineId,
      name: entity.name,
      createdAt: entity.createdAt,
    };
  }
}

export default DisciplineRepository;
