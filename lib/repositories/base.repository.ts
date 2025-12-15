/**
 * Base Repository Class
 * Abstract base class providing common CRUD operations for all repositories
 */

import { Query, type Models } from 'node-appwrite';
import { getDatabases, getDatabaseId, generateId, getPaginationQueries } from '../utils/db.js';
import { DatabaseError, NotFoundError } from '../utils/errors.js';
import type { BaseEntity } from '../types/entities.js';
import type { Logger } from '../types/logger.js';
import { createNoOpLogger } from '../types/logger.js';

/**
 * Pagination result interface
 */
export interface PaginatedResult<T> {
  documents: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Query options for list operations
 */
export interface QueryOptions {
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  filters?: string[];
}

/**
 * Abstract base repository class
 */
export abstract class BaseRepository<T extends BaseEntity> {
  protected readonly collectionId: string;
  protected readonly databaseId: string;
  protected readonly logger: Logger;

  constructor(collectionId: string, logger?: Logger) {
    this.collectionId = collectionId;
    this.databaseId = getDatabaseId();
    this.logger = logger || createNoOpLogger();
  }

  /**
   * Get the Databases instance
   */
  protected get databases() {
    return getDatabases();
  }

  /**
   * Find a document by its ID
   */
  async findById(id: string): Promise<T | null> {
    try {
      const document = await this.databases.getDocument(
        this.databaseId,
        this.collectionId,
        id
      );
      return document as unknown as T;
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw new DatabaseError(`Failed to find document by ID: ${id}`, { error });
    }
  }

  /**
   * Find a document by ID or throw NotFoundError
   */
  async findByIdOrFail(id: string, resourceName: string = 'Document'): Promise<T> {
    const document = await this.findById(id);
    if (!document) {
      throw new NotFoundError(resourceName, id);
    }
    return document;
  }

  /**
   * Find all documents with optional pagination
   */
  async findAll(options: QueryOptions = {}): Promise<PaginatedResult<T>> {
    const { page = 1, limit = 25, orderBy, orderDirection = 'desc', filters = [] } = options;

    try {
      const queries: string[] = [
        ...filters,
        ...getPaginationQueries(page, limit),
      ];

      if (orderBy) {
        queries.push(
          orderDirection === 'asc'
            ? Query.orderAsc(orderBy)
            : Query.orderDesc(orderBy)
        );
      }

      // Debug logging for database query
      this.logger.log(`[BaseRepository] Querying database - DB: ${this.databaseId}, Collection: ${this.collectionId}, Queries: ${JSON.stringify(queries)}, Page: ${page}, Limit: ${limit}`);

      const result = await this.databases.listDocuments(
        this.databaseId,
        this.collectionId,
        queries
      );

      return {
        documents: result.documents as unknown as T[],
        total: result.total,
        page,
        limit,
        hasMore: page * limit < result.total,
      };
    } catch (error: unknown) {
      // Debug logging for database errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorType = error?.constructor?.name || 'Unknown';
      this.logger.error(`[BaseRepository] Database query failed - DB: ${this.databaseId}, Collection: ${this.collectionId}, Error Type: ${errorType}, Message: ${errorMsg}`);
      throw new DatabaseError('Failed to list documents', { error });
    }
  }

  /**
   * Find documents matching specific filters
   */
  async findWhere(filters: string[], options: Omit<QueryOptions, 'filters'> = {}): Promise<PaginatedResult<T>> {
    return this.findAll({ ...options, filters });
  }

  /**
   * Find a single document matching filters
   */
  async findOneWhere(filters: string[]): Promise<T | null> {
    const result = await this.findAll({ filters, limit: 1 });
    return result.documents[0] || null;
  }

  /**
   * Create a new document
   */
  async create(data: Omit<T, keyof BaseEntity>, id?: string): Promise<T> {
    try {
      const documentId = id || generateId();
      const document = await this.databases.createDocument(
        this.databaseId,
        this.collectionId,
        documentId,
        data as Record<string, unknown>
      );
      return document as unknown as T;
    } catch (error: unknown) {
      throw new DatabaseError('Failed to create document', { error, data });
    }
  }

  /**
   * Update an existing document
   */
  async update(id: string, data: Partial<Omit<T, keyof BaseEntity>>): Promise<T> {
    try {
      const document = await this.databases.updateDocument(
        this.databaseId,
        this.collectionId,
        id,
        data as Record<string, unknown>
      );
      return document as unknown as T;
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        throw new NotFoundError('Document', id);
      }
      throw new DatabaseError(`Failed to update document: ${id}`, { error, data });
    }
  }

  /**
   * Delete a document by ID
   */
  async delete(id: string): Promise<void> {
    try {
      await this.databases.deleteDocument(
        this.databaseId,
        this.collectionId,
        id
      );
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        throw new NotFoundError('Document', id);
      }
      throw new DatabaseError(`Failed to delete document: ${id}`, { error });
    }
  }

  /**
   * Count documents matching filters
   */
  async count(filters: string[] = []): Promise<number> {
    try {
      const result = await this.databases.listDocuments(
        this.databaseId,
        this.collectionId,
        [...filters, Query.limit(1)]
      );
      return result.total;
    } catch (error: unknown) {
      throw new DatabaseError('Failed to count documents', { error });
    }
  }

  /**
   * Check if a document exists
   */
  async exists(id: string): Promise<boolean> {
    const document = await this.findById(id);
    return document !== null;
  }

  /**
   * Check if documents matching filters exist
   */
  async existsWhere(filters: string[]): Promise<boolean> {
    const count = await this.count(filters);
    return count > 0;
  }

  /**
   * Bulk create documents
   */
  async createMany(items: Array<Omit<T, keyof BaseEntity>>): Promise<T[]> {
    const results: T[] = [];
    for (const item of items) {
      const created = await this.create(item);
      results.push(created);
    }
    return results;
  }

  /**
   * Check if an error is a "not found" error
   */
  protected isNotFoundError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'code' in error) {
      return (error as { code: number }).code === 404;
    }
    return false;
  }

  /**
   * Build equality filter
   */
  protected equalFilter(attribute: string, value: string | number | boolean): string {
    return Query.equal(attribute, value);
  }

  /**
   * Build search filter
   */
  protected searchFilter(attribute: string, value: string): string {
    return Query.search(attribute, value);
  }

  /**
   * Build contains filter for arrays
   */
  protected containsFilter(attribute: string, value: string): string {
    return Query.contains(attribute, value);
  }
}

export default BaseRepository;
