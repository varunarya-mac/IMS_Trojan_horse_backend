/**
 * Cleanup Context Task
 * Deletes expired chat context entries
 */

import { ChatContextRepository } from '@lib/repositories/context.repository.js';
import type { Logger } from '@lib/types/logger.js';

export interface CleanupContextResult {
  deletedCount: number;
  errors: string[];
}

/**
 * Clean up expired chat context entries
 */
export async function cleanupExpiredContext(logger: Logger): Promise<CleanupContextResult> {
  const result: CleanupContextResult = {
    deletedCount: 0,
    errors: [],
  };

  try {
    const contextRepository = new ChatContextRepository(logger);

    // Find expired contexts
    const expiredContexts = await contextRepository.findExpired();
    logger.log(`Found ${expiredContexts.length} expired context entries`);

    if (expiredContexts.length === 0) {
      return result;
    }

    // Delete each expired context
    for (const ctx of expiredContexts) {
      try {
        await contextRepository.deleteByChatId(ctx.chatId);
        result.deletedCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to delete context for chat ${ctx.chatId}: ${errorMessage}`);
        logger.error(`Failed to delete context ${ctx.$id}: ${errorMessage}`);
      }
    }

    logger.log(`Deleted ${result.deletedCount} expired context entries`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Context cleanup failed: ${errorMessage}`);
    logger.error(`Context cleanup error: ${errorMessage}`);
  }

  return result;
}

export default cleanupExpiredContext;
