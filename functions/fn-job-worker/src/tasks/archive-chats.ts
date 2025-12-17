/**
 * Archive Chats Task
 * Archives old, inactive chats and their associated data
 */

import { ChatRepository } from '@lib/repositories/chat.repository.js';
import { MessageRepository } from '@lib/repositories/message.repository.js';
import { ChatContextRepository } from '@lib/repositories/context.repository.js';
import { getStorage, BUCKET_IDS } from '@lib/utils/db.js';
import type { Logger } from '@lib/types/logger.js';

export interface ArchiveChatsResult {
  archivedCount: number;
  deletedMessages: number;
  deletedFiles: number;
  errors: string[];
}

// Default: archive chats older than 30 days
const ARCHIVE_AGE_DAYS = parseInt(process.env.CHAT_ARCHIVE_AGE_DAYS || '30', 10);

/**
 * Archive old, inactive chats
 */
export async function archiveOldChats(logger: Logger): Promise<ArchiveChatsResult> {
  const result: ArchiveChatsResult = {
    archivedCount: 0,
    deletedMessages: 0,
    deletedFiles: 0,
    errors: [],
  };

  try {
    const chatRepository = new ChatRepository(logger);
    const messageRepository = new MessageRepository(logger);
    const contextRepository = new ChatContextRepository(logger);
    const storage = getStorage();

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ARCHIVE_AGE_DAYS);
    const cutoffIso = cutoffDate.toISOString();

    logger.log(`Archiving chats older than ${ARCHIVE_AGE_DAYS} days (before ${cutoffIso})`);

    // Find old chats
    const oldChats = await chatRepository.findOldChats(cutoffIso);
    logger.log(`Found ${oldChats.length} chats to archive`);

    if (oldChats.length === 0) {
      return result;
    }

    // Process each chat
    for (const chat of oldChats) {
      try {
        // Get messages with graphs to delete files
        const messagesWithGraphs = await messageRepository.findWithGraphsByChatId(chat.$id);

        // Delete graph images
        for (const message of messagesWithGraphs) {
          if (message.graphImageId) {
            try {
              await storage.deleteFile(BUCKET_IDS.REFRIGERATION_FILES, message.graphImageId);
              result.deletedFiles++;
            } catch {
              // File may already be deleted, ignore
            }
          }
        }

        // Delete CSV file if exists
        if (chat.csvFileId) {
          try {
            await storage.deleteFile(BUCKET_IDS.REFRIGERATION_FILES, chat.csvFileId);
            result.deletedFiles++;
          } catch {
            // File may already be deleted, ignore
          }
        }

        // Delete all messages
        const deletedMsgCount = await messageRepository.deleteAllByChatId(chat.$id);
        result.deletedMessages += deletedMsgCount;

        // Delete context
        await contextRepository.deleteByChatId(chat.$id);

        // Delete the chat itself
        await chatRepository.delete(chat.$id);
        result.archivedCount++;

        logger.log(`Archived chat ${chat.$id}: ${deletedMsgCount} messages, ${messagesWithGraphs.length} graphs`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to archive chat ${chat.$id}: ${errorMessage}`);
        logger.error(`Failed to archive chat ${chat.$id}: ${errorMessage}`);
      }
    }

    logger.log(`Archived ${result.archivedCount} chats, deleted ${result.deletedMessages} messages, ${result.deletedFiles} files`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Chat archive failed: ${errorMessage}`);
    logger.error(`Chat archive error: ${errorMessage}`);
  }

  return result;
}

export default archiveOldChats;
