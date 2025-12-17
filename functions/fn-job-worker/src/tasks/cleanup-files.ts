/**
 * Cleanup Files Task
 * Removes orphan files from storage (files not referenced by any entity)
 */

import { getStorage, BUCKET_IDS } from '@lib/utils/db.js';
import { ChatRepository } from '@lib/repositories/chat.repository.js';
import { MessageRepository } from '@lib/repositories/message.repository.js';
import type { Logger } from '@lib/types/logger.js';

export interface CleanupFilesResult {
  scannedCount: number;
  deletedCount: number;
  errors: string[];
}

/**
 * Clean up orphan files from storage
 */
export async function cleanupOrphanFiles(logger: Logger): Promise<CleanupFilesResult> {
  const result: CleanupFilesResult = {
    scannedCount: 0,
    deletedCount: 0,
    errors: [],
  };

  try {
    const storage = getStorage();
    const chatRepository = new ChatRepository(logger);
    const messageRepository = new MessageRepository(logger);

    // Get all files from the refrigeration bucket
    const filesResponse = await storage.listFiles(BUCKET_IDS.REFRIGERATION_FILES);
    const files = filesResponse.files;
    result.scannedCount = files.length;

    logger.log(`Scanning ${files.length} files for orphans`);

    if (files.length === 0) {
      return result;
    }

    // Collect all referenced file IDs
    const referencedFileIds = new Set<string>();

    // Get all chats and their CSV file IDs
    const chats = await chatRepository.findAll({ limit: 10000 });
    for (const chat of chats.documents) {
      if (chat.csvFileId) {
        referencedFileIds.add(chat.csvFileId);
      }
    }

    // Get all messages with graph images
    for (const chat of chats.documents) {
      const messagesWithGraphs = await messageRepository.findWithGraphsByChatId(chat.$id);
      for (const message of messagesWithGraphs) {
        if (message.graphImageId) {
          referencedFileIds.add(message.graphImageId);
        }
      }
    }

    logger.log(`Found ${referencedFileIds.size} referenced files`);

    // Check for files older than 24 hours that are not referenced
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

    for (const file of files) {
      const fileCreatedAt = new Date(file.$createdAt).getTime();

      // Skip files that are less than 24 hours old (give time for references to be created)
      if (fileCreatedAt > cutoffTime) {
        continue;
      }

      // Skip files that are referenced
      if (referencedFileIds.has(file.$id)) {
        continue;
      }

      // Delete orphan file
      try {
        await storage.deleteFile(BUCKET_IDS.REFRIGERATION_FILES, file.$id);
        result.deletedCount++;
        logger.log(`Deleted orphan file: ${file.$id} (${file.name})`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to delete file ${file.$id}: ${errorMessage}`);
        logger.error(`Failed to delete file ${file.$id}: ${errorMessage}`);
      }
    }

    logger.log(`Deleted ${result.deletedCount} orphan files`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`File cleanup failed: ${errorMessage}`);
    logger.error(`File cleanup error: ${errorMessage}`);
  }

  return result;
}

export default cleanupOrphanFiles;
