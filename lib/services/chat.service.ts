/**
 * Chat Service
 * Business logic for chat operations
 */

import { ChatRepository } from '../repositories/chat.repository.js';
import { MessageRepository } from '../repositories/message.repository.js';
import { ChatContextRepository } from '../repositories/context.repository.js';
import { getStorage, BUCKET_IDS } from '../utils/db.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import type {
  ChatEntity,
  ChatDTO,
  ChatListItemDTO,
  ChatStatus,
  StoreInfo,
  CSVMetadata,
  CreateChatResponse,
  DeleteChatResponse,
} from '../types/chat.types.js';
import type { MessageDTO } from '../types/message.types.js';
import type { Logger } from '../types/logger.js';
import { createNoOpLogger } from '../types/logger.js';

/**
 * Chat service for managing chat sessions
 */
export class ChatService {
  private readonly chatRepository: ChatRepository;
  private readonly messageRepository: MessageRepository;
  private readonly contextRepository: ChatContextRepository;
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || createNoOpLogger();
    this.chatRepository = new ChatRepository(this.logger);
    this.messageRepository = new MessageRepository(this.logger);
    this.contextRepository = new ChatContextRepository(this.logger);
  }

  /**
   * Create a new chat
   */
  async createChat(userId: string, title?: string): Promise<CreateChatResponse> {
    const chatTitle = title || this.generateDefaultTitle();

    const chat = await this.chatRepository.create({
      userId,
      title: chatTitle,
      status: 'active',
      csvFileId: null,
      csvFileName: null,
      csvFileSize: null,
      deviceType: null,
      storeInfo: null,
      metadata: null,
    } as Omit<ChatEntity, '$id' | '$createdAt' | '$updatedAt'>);

    return {
      chatId: chat.$id,
      title: chat.title,
      status: chat.status as ChatStatus,
      createdAt: chat.$createdAt,
    };
  }

  /**
   * Get chat by ID for a user
   */
  async getChatForUser(chatId: string, userId: string): Promise<ChatDTO> {
    const chat = await this.chatRepository.findById(chatId);

    if (!chat) {
      throw new NotFoundError('Chat', chatId);
    }

    if (chat.userId !== userId) {
      throw new ForbiddenError('Access denied to this chat');
    }

    return this.toChatDTO(chat);
  }

  /**
   * List chats for a user
   */
  async listChatsForUser(
    userId: string,
    options: { limit?: number; offset?: number; status?: ChatStatus }
  ): Promise<{ chats: ChatListItemDTO[]; total: number }> {
    const { limit = 20, offset = 0, status } = options;
    const page = Math.floor(offset / limit) + 1;

    let result;
    if (status) {
      result = await this.chatRepository.findByUserIdAndStatus(userId, status, { page, limit });
    } else {
      result = await this.chatRepository.findByUserId(userId, { page, limit });
    }

    // Get message counts for each chat
    const chatsWithCounts = await Promise.all(
      result.documents.map(async (chat) => {
        const messageCount = await this.messageRepository.countByChatId(chat.$id);
        const latestMessage = await this.messageRepository.getLatestByChatId(chat.$id);

        return this.toChatListItemDTO(chat, messageCount, latestMessage?.$createdAt || null);
      })
    );

    return {
      chats: chatsWithCounts,
      total: result.total,
    };
  }

  /**
   * Delete chat and all related resources
   */
  async deleteChatForUser(chatId: string, userId: string): Promise<DeleteChatResponse> {
    const chat = await this.chatRepository.findById(chatId);

    if (!chat) {
      throw new NotFoundError('Chat', chatId);
    }

    if (chat.userId !== userId) {
      throw new ForbiddenError('Access denied to this chat');
    }

    const deletedResources = {
      chat: false,
      messages: 0,
      csvFile: false,
      graphFiles: 0,
      context: false,
    };

    // Delete graph images from storage
    const messagesWithGraphs = await this.messageRepository.findWithGraphsByChatId(chatId);
    const storage = getStorage();

    for (const message of messagesWithGraphs) {
      if (message.graphImageId) {
        try {
          await storage.deleteFile(BUCKET_IDS.REFRIGERATION_FILES, message.graphImageId);
          deletedResources.graphFiles++;
        } catch (error) {
          this.logger.error(`Failed to delete graph file: ${message.graphImageId}`);
        }
      }
    }

    // Delete CSV file from storage
    if (chat.csvFileId) {
      try {
        await storage.deleteFile(BUCKET_IDS.REFRIGERATION_FILES, chat.csvFileId);
        deletedResources.csvFile = true;
      } catch (error) {
        this.logger.error(`Failed to delete CSV file: ${chat.csvFileId}`);
      }
    }

    // Delete all messages
    deletedResources.messages = await this.messageRepository.deleteAllByChatId(chatId);

    // Delete chat context
    deletedResources.context = await this.contextRepository.deleteByChatId(chatId);

    // Delete the chat
    await this.chatRepository.delete(chatId);
    deletedResources.chat = true;

    return {
      success: true,
      deletedResources,
    };
  }

  /**
   * Update chat status
   */
  async updateChatStatus(chatId: string, status: ChatStatus): Promise<void> {
    await this.chatRepository.updateStatus(chatId, status);
  }

  /**
   * Update chat with CSV info
   */
  async updateChatWithCSVInfo(
    chatId: string,
    csvInfo: {
      csvFileId: string;
      csvFileName: string;
      csvFileSize: number;
    }
  ): Promise<void> {
    await this.chatRepository.updateWithCSVInfo(chatId, csvInfo);
  }

  /**
   * Update chat metadata after analysis
   */
  async updateChatMetadata(
    chatId: string,
    metadata: {
      deviceType?: string | null;
      storeInfo?: StoreInfo | null;
      csvMetadata?: CSVMetadata | null;
    }
  ): Promise<void> {
    await this.chatRepository.updateMetadata(chatId, {
      deviceType: metadata.deviceType,
      storeInfo: metadata.storeInfo ? JSON.stringify(metadata.storeInfo) : null,
      metadata: metadata.csvMetadata ? JSON.stringify(metadata.csvMetadata) : null,
    });
  }

  /**
   * Check if chat has CSV context
   */
  async chatHasCSVContext(chatId: string): Promise<boolean> {
    const chat = await this.chatRepository.findById(chatId);
    return chat !== null && chat.csvFileId !== null;
  }

  /**
   * Get CSV file ID for a chat
   */
  async getChatCSVFileId(chatId: string): Promise<string | null> {
    const chat = await this.chatRepository.findById(chatId);
    return chat?.csvFileId || null;
  }

  /**
   * Generate default title for a chat
   */
  private generateDefaultTitle(): string {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    };
    return `Chat - ${now.toLocaleDateString('en-US', options)}`;
  }

  /**
   * Convert ChatEntity to ChatDTO
   */
  private toChatDTO(chat: ChatEntity): ChatDTO {
    return {
      id: chat.$id,
      userId: chat.userId,
      title: chat.title,
      status: chat.status as ChatStatus,
      csvFileId: chat.csvFileId,
      csvFileName: chat.csvFileName,
      csvFileSize: chat.csvFileSize,
      deviceType: chat.deviceType as ChatDTO['deviceType'],
      storeInfo: chat.storeInfo ? JSON.parse(chat.storeInfo) : null,
      metadata: chat.metadata ? JSON.parse(chat.metadata) : null,
      createdAt: chat.$createdAt,
      updatedAt: chat.$updatedAt,
    };
  }

  /**
   * Convert ChatEntity to ChatListItemDTO
   */
  private toChatListItemDTO(
    chat: ChatEntity,
    messageCount: number,
    lastMessageAt: string | null
  ): ChatListItemDTO {
    return {
      id: chat.$id,
      title: chat.title,
      status: chat.status as ChatStatus,
      deviceType: chat.deviceType as ChatListItemDTO['deviceType'],
      csvFileName: chat.csvFileName,
      messageCount,
      lastMessageAt,
      createdAt: chat.$createdAt,
      updatedAt: chat.$updatedAt,
    };
  }
}

export default ChatService;
