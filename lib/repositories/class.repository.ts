/**
 * Class Repository
 * Handles data access for classes (threshold configurations)
 */

import { Query } from 'node-appwrite';
import { BaseRepository, type PaginatedResult } from './base.repository.js';
import { COLLECTION_IDS, type ClassEntity, type FieldEntity } from '../types/entities.js';
import type { ClassDTO, FieldDTO, SeverityThreshold, ClassPattern } from '../types/dtos.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

/**
 * Parse JSON data field safely
 */
function parseJsonField<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Stringify data for storage
 */
function stringifyField(data: unknown): string | null {
  if (data === null || data === undefined) return null;
  return JSON.stringify(data);
}

/**
 * Repository for managing classes
 */
export class ClassRepository extends BaseRepository<ClassEntity> {
  constructor() {
    super(COLLECTION_IDS.CLASSES);
  }

  /**
   * Find all classes for a discipline type
   */
  async findByDisciplineType(disciplineTypeId: string): Promise<PaginatedResult<ClassEntity>> {
    return this.findWhere(
      [Query.equal('disciplineTypeId', disciplineTypeId)],
      { limit: 100 }
    );
  }

  /**
   * Find class by discipline type and class ID
   */
  async findByDisciplineTypeAndClassId(
    disciplineTypeId: string,
    classId: string
  ): Promise<ClassEntity | null> {
    return this.findOneWhere([
      Query.equal('disciplineTypeId', disciplineTypeId),
      Query.equal('classId', classId),
    ]);
  }

  /**
   * Find class by class ID (across all discipline types)
   */
  async findByClassId(classId: string): Promise<ClassEntity[]> {
    const result = await this.findWhere(
      [Query.equal('classId', classId)],
      { limit: 100 }
    );
    return result.documents;
  }

  /**
   * Create a new class
   */
  async createClass(data: {
    disciplineTypeId: string;
    classId: string;
    description: string;
    defaultFlag: number;
    data?: unknown[];
    patterns?: ClassPattern[];
  }): Promise<ClassEntity> {
    // Check if class already exists
    const existing = await this.findByDisciplineTypeAndClassId(
      data.disciplineTypeId,
      data.classId
    );
    if (existing) {
      throw new ConflictError(
        `Class '${data.classId}' already exists for this discipline type`
      );
    }

    return this.create({
      disciplineTypeId: data.disciplineTypeId,
      classId: data.classId,
      description: data.description,
      defaultFlag: data.defaultFlag,
      data: stringifyField(data.data),
      patterns: stringifyField(data.patterns),
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Update a class
   */
  async updateClass(
    id: string,
    data: Partial<{
      description: string;
      defaultFlag: number;
      data: unknown[];
      patterns: ClassPattern[];
    }>
  ): Promise<ClassEntity> {
    const existing = await this.findByIdOrFail(id, 'Class');

    const updateData: Partial<ClassEntity> = {};

    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.defaultFlag !== undefined) {
      updateData.defaultFlag = data.defaultFlag;
    }
    if (data.data !== undefined) {
      updateData.data = stringifyField(data.data);
    }
    if (data.patterns !== undefined) {
      updateData.patterns = stringifyField(data.patterns);
    }

    return this.update(id, updateData);
  }

  /**
   * Get classes with parsed JSON fields
   */
  async getClassesByDisciplineType(disciplineTypeId: string): Promise<ClassDTO[]> {
    const { documents } = await this.findByDisciplineType(disciplineTypeId);
    return documents.map(cls => this.toDTO(cls));
  }

  /**
   * Convert entity to DTO with parsed JSON fields
   */
  toDTO(entity: ClassEntity): ClassDTO {
    return {
      id: entity.$id,
      disciplineTypeId: entity.disciplineTypeId,
      classId: entity.classId,
      description: entity.description,
      defaultFlag: entity.defaultFlag,
      data: parseJsonField<SeverityThreshold>(entity.data),
      patterns: parseJsonField<ClassPattern[]>(entity.patterns),
      createdAt: entity.createdAt,
    };
  }
}

/**
 * Repository for managing fields
 */
export class FieldRepository extends BaseRepository<FieldEntity> {
  constructor() {
    super(COLLECTION_IDS.FIELDS);
  }

  /**
   * Find all fields for a discipline type
   */
  async findByDisciplineType(disciplineTypeId: string): Promise<PaginatedResult<FieldEntity>> {
    return this.findWhere(
      [Query.equal('disciplineTypeId', disciplineTypeId)],
      { limit: 500 }
    );
  }

  /**
   * Find field by discipline type and name
   */
  async findByDisciplineTypeAndName(
    disciplineTypeId: string,
    name: string
  ): Promise<FieldEntity | null> {
    return this.findOneWhere([
      Query.equal('disciplineTypeId', disciplineTypeId),
      Query.equal('name', name),
    ]);
  }

  /**
   * Create a new field
   */
  async createField(data: {
    disciplineTypeId: string;
    name: string;
    arrayType?: string;
    arraySize?: number;
    fieldType1?: string;
    fieldType2?: string;
  }): Promise<FieldEntity> {
    // Check if field already exists
    const existing = await this.findByDisciplineTypeAndName(
      data.disciplineTypeId,
      data.name
    );
    if (existing) {
      throw new ConflictError(
        `Field '${data.name}' already exists for this discipline type`
      );
    }

    return this.create({
      disciplineTypeId: data.disciplineTypeId,
      name: data.name,
      arrayType: data.arrayType || null,
      arraySize: data.arraySize ?? null,
      fieldType1: data.fieldType1 || null,
      fieldType2: data.fieldType2 || null,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Get fields as DTOs
   */
  async getFieldsByDisciplineType(disciplineTypeId: string): Promise<FieldDTO[]> {
    const { documents } = await this.findByDisciplineType(disciplineTypeId);
    return documents.map(field => this.toDTO(field));
  }

  /**
   * Convert entity to DTO
   */
  toDTO(entity: FieldEntity): FieldDTO {
    return {
      id: entity.$id,
      disciplineTypeId: entity.disciplineTypeId,
      name: entity.name,
      arrayType: entity.arrayType,
      arraySize: entity.arraySize,
      fieldType1: entity.fieldType1,
      fieldType2: entity.fieldType2,
      createdAt: entity.createdAt,
    };
  }
}

export default ClassRepository;
