/**
 * Database Connection Utilities
 * Appwrite SDK initialization and helper functions
 */

import { Client, Databases, ID, Query } from 'node-appwrite';
import { COLLECTION_IDS } from '../types/entities.js';

/**
 * Environment configuration
 */
export interface AppwriteConfig {
  endpoint: string;
  projectId: string;
  apiKey: string;
  databaseId: string;
}

/**
 * Get configuration from environment variables
 */
export function getConfig(): AppwriteConfig {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  const databaseId = process.env.APPWRITE_DATABASE_ID;

  if (!endpoint || !projectId || !apiKey || !databaseId) {
    throw new Error(
      'Missing required environment variables: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID'
    );
  }

  return { endpoint, projectId, apiKey, databaseId };
}

/**
 * Singleton client instance
 */
let clientInstance: Client | null = null;
let databasesInstance: Databases | null = null;

/**
 * Get or create Appwrite client
 */
export function getClient(): Client {
  if (!clientInstance) {
    const config = getConfig();
    clientInstance = new Client()
      .setEndpoint(config.endpoint)
      .setProject(config.projectId)
      .setKey(config.apiKey);
  }
  return clientInstance;
}

/**
 * Get or create Databases instance
 */
export function getDatabases(): Databases {
  if (!databasesInstance) {
    databasesInstance = new Databases(getClient());
  }
  return databasesInstance;
}

/**
 * Get database ID from config
 */
export function getDatabaseId(): string {
  return getConfig().databaseId;
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return ID.unique();
}

/**
 * Query builder helpers
 */
export const QueryBuilder = {
  /**
   * Equal query
   */
  equal: (attribute: string, value: string | number | boolean) =>
    Query.equal(attribute, value),

  /**
   * Not equal query
   */
  notEqual: (attribute: string, value: string | number | boolean) =>
    Query.notEqual(attribute, value),

  /**
   * Greater than query
   */
  greaterThan: (attribute: string, value: number) =>
    Query.greaterThan(attribute, value),

  /**
   * Less than query
   */
  lessThan: (attribute: string, value: number) =>
    Query.lessThan(attribute, value),

  /**
   * Order by ascending
   */
  orderAsc: (attribute: string) => Query.orderAsc(attribute),

  /**
   * Order by descending
   */
  orderDesc: (attribute: string) => Query.orderDesc(attribute),

  /**
   * Limit results
   */
  limit: (limit: number) => Query.limit(limit),

  /**
   * Offset results
   */
  offset: (offset: number) => Query.offset(offset),

  /**
   * Search query
   */
  search: (attribute: string, value: string) => Query.search(attribute, value),

  /**
   * Select specific attributes
   */
  select: (attributes: string[]) => Query.select(attributes),
};

/**
 * Collection IDs exported for convenience
 */
export { COLLECTION_IDS };

/**
 * Pagination helper
 */
export function getPaginationQueries(page: number, limit: number): string[] {
  const offset = (page - 1) * limit;
  return [Query.limit(limit), Query.offset(offset)];
}

/**
 * Reset client (useful for testing)
 */
export function resetClient(): void {
  clientInstance = null;
  databasesInstance = null;
}
