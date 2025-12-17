/**
 * Chat Repository
 * Handles database operations for chat documents
 */

import { Query } from 'node-appwrite';
import { BaseRepository, type QueryOptions, type PaginatedResult } from './base.repository.js';
import { COLLECTION_IDS } from '../types/entities.js';
import type { ChatEntity, ChatStatus } from '../types/chat.types.js';
import type { Logger } from '../types/logger.js';

/**
 * Chat repository for managing chat documents
 */
export class ChatRepository extends BaseRepository<ChatEntity> {
  constructor(logger?: Logger) {
    super(COLLECTION_IDS.CHATS, logger);
  }

  /**
   * Find all chats for a specific user
   */
  async findByUserId(
    userId: string,
    options: Omit<QueryOptions, 'filters'> = {}
  ): Promise<PaginatedResult<ChatEntity>> {
    const filters = [Query.equal('userId', userId)];
    return this.findAll({
      ...options,
      filters,
      orderBy: options.orderBy || '$createdAt',
      orderDirection: options.orderDirection || 'desc',
    });
  }

  /**
   * Find chats for a user filtered by status
   */
  async findByUserIdAndStatus(
    userId: string,
    status: ChatStatus,
    options: Omit<QueryOptions, 'filters'> = {}
  ): Promise<PaginatedResult<ChatEntity>> {
    const filters = [
      Query.equal('userId', userId),
      Query.equal('status', status),
    ];
    return this.findAll({
      ...options,
      filters,
      orderBy: options.orderBy || '$createdAt',
      orderDirection: options.orderDirection || 'desc',
    });
  }

  /**
   * Count chats for a user
   */
  async countByUserId(userId: string): Promise<number> {
    return this.count([Query.equal('userId', userId)]);
  }

  /**
   * Count chats for a user by status
   */
  async countByUserIdAndStatus(userId: string, status: ChatStatus): Promise<number> {
    return this.count([
      Query.equal('userId', userId),
      Query.equal('status', status),
    ]);
  }

  /**
   * Update chat status
   */
  async updateStatus(chatId: string, status: ChatStatus): Promise<ChatEntity> {
    return this.update(chatId, { status } as Partial<Omit<ChatEntity, keyof import('../types/entities.js').BaseEntity>>);
  }

  /**
   * Update chat with CSV file info
   */
  async updateWithCSVInfo(
    chatId: string,
    csvInfo: {
      csvFileId: string;
      csvFileName: string;
      csvFileSize: number;
    }
  ): Promise<ChatEntity> {
    return this.update(chatId, csvInfo as Partial<Omit<ChatEntity, keyof import('../types/entities.js').BaseEntity>>);
  }

  /**
   * Update chat metadata
   */
  async updateMetadata(
    chatId: string,
    metadata: {
      deviceType?: string | null;
      storeInfo?: string | null;
      metadata?: string | null;
    }
  ): Promise<ChatEntity> {
    return this.update(chatId, metadata as Partial<Omit<ChatEntity, keyof import('../types/entities.js').BaseEntity>>);
  }

  /**
   * Check if user owns the chat
   */
  async isOwnedByUser(chatId: string, userId: string): Promise<boolean> {
    const chat = await this.findById(chatId);
    return chat !== null && chat.userId === userId;
  }

  /**
   * Get chat with validation that user owns it
   */
  async findByIdForUser(chatId: string, userId: string): Promise<ChatEntity | null> {
    const chat = await this.findById(chatId);
    if (chat && chat.userId === userId) {
      return chat;
    }
    return null;
  }

  /**
   * Get chat or throw if not found or not owned by user
   */
  async findByIdForUserOrFail(chatId: string, userId: string): Promise<ChatEntity> {
    const chat = await this.findByIdOrFail(chatId, 'Chat');
    if (chat.userId !== userId) {
      throw new Error('Access denied');
    }
    return chat;
  }
}

export default ChatRepository;
