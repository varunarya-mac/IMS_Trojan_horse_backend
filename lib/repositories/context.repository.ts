/**
 * Context Repository
 * Handles database operations for chat context documents
 */

import { Query } from 'node-appwrite';
import { BaseRepository } from './base.repository.js';
import { COLLECTION_IDS } from '../types/entities.js';
import type { ChatContextEntity, CachedCSVData } from '../types/context.types.js';
import type { BaseEntity } from '../types/entities.js';
import type { Logger } from '../types/logger.js';

/**
 * Default context expiry in hours
 */
const DEFAULT_EXPIRY_HOURS = 24;

/**
 * Context repository for managing chat context documents
 */
export class ChatContextRepository extends BaseRepository<ChatContextEntity> {
  constructor(logger?: Logger) {
    super(COLLECTION_IDS.CHAT_CONTEXT, logger);
  }

  /**
   * Find context by chat ID
   */
  async findByChatId(chatId: string): Promise<ChatContextEntity | null> {
    return this.findOneWhere([Query.equal('chatId', chatId)]);
  }

  /**
   * Create or update context for a chat
   */
  async createOrUpdate(
    chatId: string,
    csvFileId: string,
    csvData: CachedCSVData,
    expiryHours: number = DEFAULT_EXPIRY_HOURS
  ): Promise<ChatContextEntity> {
    const existing = await this.findByChatId(chatId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);

    const data = {
      chatId,
      csvFileId,
      csvData: JSON.stringify(csvData),
      lastUpdated: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    if (existing) {
      return this.update(existing.$id, data as Partial<Omit<ChatContextEntity, keyof BaseEntity>>);
    }

    return this.create(data as Omit<ChatContextEntity, keyof BaseEntity>);
  }

  /**
   * Update CSV data for existing context
   */
  async updateCsvData(
    chatId: string,
    csvData: CachedCSVData,
    expiryHours: number = DEFAULT_EXPIRY_HOURS
  ): Promise<ChatContextEntity | null> {
    const existing = await this.findByChatId(chatId);
    if (!existing) return null;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);

    return this.update(existing.$id, {
      csvData: JSON.stringify(csvData),
      lastUpdated: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    } as Partial<Omit<ChatContextEntity, keyof BaseEntity>>);
  }

  /**
   * Get cached CSV data from context
   */
  async getCachedCsvData(chatId: string): Promise<CachedCSVData | null> {
    const context = await this.findByChatId(chatId);
    if (!context || !context.csvData) return null;

    try {
      return JSON.parse(context.csvData) as CachedCSVData;
    } catch {
      return null;
    }
  }

  /**
   * Find expired contexts for cleanup
   */
  async findExpired(limit: number = 100): Promise<ChatContextEntity[]> {
    const now = new Date().toISOString();
    const result = await this.findAll({
      filters: [Query.lessThan('expiresAt', now)],
      limit,
    });
    return result.documents;
  }

  /**
   * Delete context by chat ID
   */
  async deleteByChatId(chatId: string): Promise<boolean> {
    const context = await this.findByChatId(chatId);
    if (!context) return false;

    await this.delete(context.$id);
    return true;
  }

  /**
   * Extend expiry for a context
   */
  async extendExpiry(chatId: string, additionalHours: number = DEFAULT_EXPIRY_HOURS): Promise<ChatContextEntity | null> {
    const context = await this.findByChatId(chatId);
    if (!context) return null;

    const currentExpiry = new Date(context.expiresAt);
    const newExpiry = new Date(currentExpiry.getTime() + additionalHours * 60 * 60 * 1000);

    return this.update(context.$id, {
      expiresAt: newExpiry.toISOString(),
    } as Partial<Omit<ChatContextEntity, keyof BaseEntity>>);
  }

  /**
   * Check if context exists and is valid (not expired)
   */
  async isValidContext(chatId: string): Promise<boolean> {
    const context = await this.findByChatId(chatId);
    if (!context) return false;

    const now = new Date();
    const expiresAt = new Date(context.expiresAt);
    return now < expiresAt && context.csvData !== null;
  }

  /**
   * Delete all expired contexts
   */
  async deleteExpired(): Promise<number> {
    const expired = await this.findExpired(1000);
    let deletedCount = 0;

    for (const context of expired) {
      await this.delete(context.$id);
      deletedCount++;
    }

    return deletedCount;
  }

  /**
   * Get context statistics
   */
  async getStats(): Promise<{ total: number; expired: number; withData: number }> {
    const now = new Date().toISOString();

    const [totalResult, expiredResult, withDataResult] = await Promise.all([
      this.findAll({ limit: 1 }),
      this.count([Query.lessThan('expiresAt', now)]),
      this.count([Query.isNotNull('csvData')]),
    ]);

    return {
      total: totalResult.total,
      expired: expiredResult,
      withData: withDataResult,
    };
  }
}

export default ChatContextRepository;
