/**
 * Discipline Repository
 * Handles data access for disciplines and discipline types
 */

import { Query } from 'node-appwrite';
import { BaseRepository } from './base.repository.js';
import { COLLECTION_IDS, type DisciplineEntity, type DisciplineTypeEntity } from '../types/entities.js';
import type { DisciplineDTO, DisciplineTypeDTO } from '../types/dtos.js';
import { ConflictError, DatabaseError, NotFoundError } from '../utils/errors.js';
import type { Logger } from '../types/logger.js';

/**
 * Repository for managing disciplines
 */
export class DisciplineRepository extends BaseRepository<DisciplineEntity> {
  constructor(logger?: Logger) {
    super(COLLECTION_IDS.DISCIPLINES, logger);
  }

  /**
   * Find discipline by name
   */
  async findByName(name: string): Promise<DisciplineEntity | null> {
    try {
      this.logger.log(`[DisciplineRepository] Finding discipline by name: ${name}`);
      return await this.findOneWhere([Query.equal('name', name)]);
    } catch (error) {
      this.logger.error(`[DisciplineRepository] Error finding discipline by name '${name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new DatabaseError(`Failed to find discipline by name: ${name}`, { error });
    }
  }

  /**
   * Find discipline by name or throw
   */
  async findByNameOrFail(name: string): Promise<DisciplineEntity> {
    try {
      const discipline = await this.findByName(name);
      if (!discipline) {
        throw new NotFoundError('Discipline', name);
      }
      return discipline;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to find discipline by name: ${name}`, { error });
    }
  }

  /**
   * Get all disciplines with their types
   */
  async findAllWithTypes(): Promise<DisciplineDTO[]> {
    try {
      const disciplineTypeRepo = new DisciplineTypeRepository();

      const { documents: disciplines } = await this.findAll({ limit: 100 });

      const result: DisciplineDTO[] = [];

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

      return result;
    } catch (error) {
      throw new DatabaseError('Failed to find all disciplines with types', { error });
    }
  }

  /**
   * Create discipline with validation
   */
  async createDiscipline(data: {
    name: string;
    enterpriseName: string;
    enterpriseVersion: number;
  }): Promise<DisciplineEntity> {
    try {
      this.logger.log(`[DisciplineRepository] Creating discipline: ${data.name}`);

      // Check if discipline with same name exists
      const existing = await this.findByName(data.name);
      if (existing) {
        throw new ConflictError(`Discipline with name '${data.name}' already exists`);
      }

      const now = new Date().toISOString();
      const result = await this.create({
        ...data,
        createdAt: now,
        updatedAt: now,
      });

      this.logger.log(`[DisciplineRepository] Created discipline: ${data.name} (ID: ${result.$id})`);
      return result;
    } catch (error) {
      this.logger.error(`[DisciplineRepository] Error creating discipline '${data.name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (error instanceof ConflictError) throw error;
      throw new DatabaseError(`Failed to create discipline: ${data.name}`, { error });
    }
  }

  /**
   * Update discipline
   */
  async updateDiscipline(id: string, data: Partial<{
    name: string;
    enterpriseName: string;
    enterpriseVersion: number;
  }>): Promise<DisciplineEntity> {
    try {
      this.logger.log(`[DisciplineRepository] Updating discipline: ${id}`);

      // Verify discipline exists
      await this.findByIdOrFail(id, 'Discipline');

      // If name is being changed, check for conflicts
      if (data.name) {
        const existing = await this.findByName(data.name);
        if (existing && existing.$id !== id) {
          throw new ConflictError(`Discipline with name '${data.name}' already exists`);
        }
      }

      const result = await this.update(id, {
        ...data,
        updatedAt: new Date().toISOString(),
      });

      this.logger.log(`[DisciplineRepository] Updated discipline: ${id}`);
      return result;
    } catch (error) {
      this.logger.error(`[DisciplineRepository] Error updating discipline '${id}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (error instanceof ConflictError || error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to update discipline: ${id}`, { error });
    }
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
  constructor(logger?: Logger) {
    super(COLLECTION_IDS.DISCIPLINE_TYPES, logger);
  }

  /**
   * Find all types for a discipline
   */
  async findByDisciplineId(disciplineId: string): Promise<PaginatedResult<DisciplineTypeEntity>> {
    try {
      return await this.findWhere([Query.equal('disciplineId', disciplineId)], { limit: 100 });
    } catch (error) {
      throw new DatabaseError(`Failed to find discipline types for discipline: ${disciplineId}`, { error });
    }
  }

  /**
   * Find type by discipline ID and name
   */
  async findByDisciplineAndName(disciplineId: string, name: string): Promise<DisciplineTypeEntity | null> {
    try {
      this.logger.log(`[DisciplineTypeRepository] Finding discipline type: ${name} for discipline: ${disciplineId}`);
      return await this.findOneWhere([
        Query.equal('disciplineId', disciplineId),
        Query.equal('name', name),
      ]);
    } catch (error) {
      this.logger.error(`[DisciplineTypeRepository] Error finding discipline type '${name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new DatabaseError(`Failed to find discipline type by name: ${name}`, { error });
    }
  }

  /**
   * Find type by name across all disciplines
   */
  async findByName(name: string): Promise<DisciplineTypeEntity[]> {
    try {
      const result = await this.findWhere([Query.equal('name', name)], { limit: 100 });
      return result.documents;
    } catch (error) {
      throw new DatabaseError(`Failed to find discipline types by name: ${name}`, { error });
    }
  }

  /**
   * Get discipline type with parent discipline info
   */
  async findWithDiscipline(typeId: string): Promise<DisciplineTypeDTO | null> {
    try {
      const type = await this.findById(typeId);
      if (!type) return null;

      const disciplineRepo = new DisciplineRepository(this.logger);
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
    } catch (error) {
      throw new DatabaseError(`Failed to find discipline type with discipline: ${typeId}`, { error });
    }
  }

  /**
   * Create discipline type with validation
   */
  async createDisciplineType(data: {
    disciplineId: string;
    name: string;
  }): Promise<DisciplineTypeEntity> {
    try {
      this.logger.log(`[DisciplineTypeRepository] Creating discipline type: ${data.name} for discipline: ${data.disciplineId}`);

      // Check if type with same name exists under this discipline
      const existing = await this.findByDisciplineAndName(data.disciplineId, data.name);
      if (existing) {
        throw new ConflictError(
          `Discipline type '${data.name}' already exists under this discipline`
        );
      }

      const result = await this.create({
        ...data,
        createdAt: new Date().toISOString(),
      });

      this.logger.log(`[DisciplineTypeRepository] Created discipline type: ${data.name} (ID: ${result.$id})`);
      return result;
    } catch (error) {
      this.logger.error(`[DisciplineTypeRepository] Error creating discipline type '${data.name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (error instanceof ConflictError) throw error;
      throw new DatabaseError(`Failed to create discipline type: ${data.name}`, { error });
    }
  }

  /**
   * Get all types for a discipline with discipline info
   */
  async findByDisciplineIdWithContext(disciplineId: string): Promise<DisciplineTypeDTO[]> {
    try {
      const disciplineRepo = new DisciplineRepository(this.logger);
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
    } catch (error) {
      throw new DatabaseError(`Failed to find discipline types with context: ${disciplineId}`, { error });
    }
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
