/**
 * Message Repository
 * Handles database operations for message documents
 */

import { Query } from 'node-appwrite';
import { BaseRepository, type QueryOptions, type PaginatedResult } from './base.repository.js';
import { COLLECTION_IDS } from '../types/entities.js';
import type { MessageEntity, MessageRole, MessageContentType } from '../types/message.types.js';
import type { BaseEntity } from '../types/entities.js';
import type { Logger } from '../types/logger.js';

/**
 * Message repository for managing message documents
 */
export class MessageRepository extends BaseRepository<MessageEntity> {
  constructor(logger?: Logger) {
    super(COLLECTION_IDS.MESSAGES, logger);
  }

  /**
   * Find all messages for a specific chat
   */
  async findByChatId(
    chatId: string,
    options: Omit<QueryOptions, 'filters'> = {}
  ): Promise<PaginatedResult<MessageEntity>> {
    const filters = [Query.equal('chatId', chatId)];
    return this.findAll({
      ...options,
      filters,
      orderBy: options.orderBy || '$createdAt',
      orderDirection: options.orderDirection || 'asc', // Messages ordered oldest first
    });
  }

  /**
   * Get latest message for a chat
   */
  async getLatestByChatId(chatId: string): Promise<MessageEntity | null> {
    const result = await this.findAll({
      filters: [Query.equal('chatId', chatId)],
      orderBy: '$createdAt',
      orderDirection: 'desc',
      limit: 1,
    });
    return result.documents[0] || null;
  }

  /**
   * Get latest assistant message for a chat
   */
  async getLatestAssistantMessage(chatId: string): Promise<MessageEntity | null> {
    const result = await this.findAll({
      filters: [
        Query.equal('chatId', chatId),
        Query.equal('role', 'assistant'),
      ],
      orderBy: '$createdAt',
      orderDirection: 'desc',
      limit: 1,
    });
    return result.documents[0] || null;
  }

  /**
   * Count messages for a chat
   */
  async countByChatId(chatId: string): Promise<number> {
    return this.count([Query.equal('chatId', chatId)]);
  }

  /**
   * Count messages by role for a chat
   */
  async countByChatIdAndRole(chatId: string, role: MessageRole): Promise<number> {
    return this.count([
      Query.equal('chatId', chatId),
      Query.equal('role', role),
    ]);
  }

  /**
   * Create a user message
   */
  async createUserMessage(chatId: string, content: string): Promise<MessageEntity> {
    return this.create({
      chatId,
      role: 'user',
      content,
      contentType: 'text',
      summaryData: null,
      graphImageId: null,
      datapointsData: null,
      processingTime: null,
      tokenUsage: null,
    } as Omit<MessageEntity, keyof BaseEntity>);
  }

  /**
   * Create an assistant message (placeholder)
   */
  async createAssistantPlaceholder(chatId: string, content: string = 'Analyzing your data...'): Promise<MessageEntity> {
    return this.create({
      chatId,
      role: 'assistant',
      content,
      contentType: 'text',
      summaryData: null,
      graphImageId: null,
      datapointsData: null,
      processingTime: null,
      tokenUsage: null,
    } as Omit<MessageEntity, keyof BaseEntity>);
  }

  /**
   * Update assistant message with analysis results
   */
  async updateWithAnalysisResults(
    messageId: string,
    data: {
      content: string;
      contentType: MessageContentType;
      summaryData?: string | null;
      graphImageId?: string | null;
      datapointsData?: string | null;
      processingTime?: number | null;
      tokenUsage?: string | null;
    }
  ): Promise<MessageEntity> {
    return this.update(messageId, data as Partial<Omit<MessageEntity, keyof BaseEntity>>);
  }

  /**
   * Update message with error
   */
  async updateWithError(messageId: string, errorMessage: string): Promise<MessageEntity> {
    return this.update(messageId, {
      content: errorMessage,
      contentType: 'error',
    } as Partial<Omit<MessageEntity, keyof BaseEntity>>);
  }

  /**
   * Delete all messages for a chat
   */
  async deleteAllByChatId(chatId: string): Promise<number> {
    const messages = await this.findByChatId(chatId, { limit: 1000 });
    let deletedCount = 0;

    for (const message of messages.documents) {
      await this.delete(message.$id);
      deletedCount++;
    }

    return deletedCount;
  }

  /**
   * Get all messages with graphs for a chat (for cleanup)
   */
  async findWithGraphsByChatId(chatId: string): Promise<MessageEntity[]> {
    const result = await this.findAll({
      filters: [
        Query.equal('chatId', chatId),
        Query.isNotNull('graphImageId'),
      ],
      limit: 1000,
    });
    return result.documents;
  }
}

export default MessageRepository;
