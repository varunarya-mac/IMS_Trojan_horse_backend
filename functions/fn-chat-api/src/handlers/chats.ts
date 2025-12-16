/**
 * Chats Handler
 * Handles CRUD operations for chat sessions
 */

import { z } from 'zod';
import type { FunctionContext, RouteParams } from '../types.js';
import { getAuthenticatedUserId } from '../types.js';
import { sendSuccess, sendError, sendHandledError, parseBody } from '../utils/response.js';
import { ChatService } from '@lib/services/chat.service.js';
import { ValidationError } from '@lib/utils/errors.js';
import type { ChatStatus } from '@lib/types/chat.types.js';

// Request schemas
const ListChatsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  status: z.enum(['active', 'processing', 'completed', 'error']).optional(),
});

const CreateChatSchema = z.object({
  title: z.string().min(1).max(255).optional(),
});

/**
 * GET /chats
 * List user's chat sessions
 */
export async function listChats(
  context: FunctionContext,
  _params: RouteParams,
  query: Record<string, string>
): Promise<unknown> {
  const { req, res, log, error: logError } = context;

  try {
    const userId = getAuthenticatedUserId(req);
    log(`Listing chats for user: ${userId}`);

    // Validate query params
    const validation = ListChatsQuerySchema.safeParse(query);
    if (!validation.success) {
      throw new ValidationError('Invalid query parameters', { errors: validation.error.format() });
    }

    const { limit, offset, status } = validation.data;

    const chatService = new ChatService({ log, error: logError });
    const result = await chatService.listChatsForUser(userId, {
      limit,
      offset,
      status: status as ChatStatus | undefined,
    });

    log(`Found ${result.chats.length} chats (total: ${result.total})`);

    return sendSuccess(res, result.chats, 200, {
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    return sendHandledError(res, error);
  }
}

/**
 * POST /chats
 * Create a new chat session
 */
export async function createChat(
  context: FunctionContext,
  _params: RouteParams,
  _query: Record<string, string>
): Promise<unknown> {
  const { req, res, log, error: logError } = context;

  try {
    const userId = getAuthenticatedUserId(req);
    log(`Creating chat for user: ${userId}`);

    // Parse and validate body
    const body = parseBody<Record<string, unknown>>(req);
    const validation = CreateChatSchema.safeParse(body || {});
    if (!validation.success) {
      throw new ValidationError('Invalid request body', { errors: validation.error.format() });
    }

    const chatService = new ChatService({ log, error: logError });
    const result = await chatService.createChat(userId, validation.data.title);

    log(`Created chat: ${result.chatId}`);

    return sendSuccess(res, result, 201);
  } catch (error) {
    return sendHandledError(res, error);
  }
}

/**
 * GET /chats/:chatId
 * Get a specific chat session with details
 */
export async function getChat(
  context: FunctionContext,
  params: RouteParams,
  _query: Record<string, string>
): Promise<unknown> {
  const { req, res, log, error: logError } = context;

  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = params.chatId;
    log(`Getting chat: ${chatId} for user: ${userId}`);

    const chatService = new ChatService({ log, error: logError });
    const chat = await chatService.getChatForUser(chatId, userId);

    return sendSuccess(res, chat);
  } catch (error) {
    return sendHandledError(res, error);
  }
}

/**
 * DELETE /chats/:chatId
 * Delete a chat session and all related resources
 */
export async function deleteChat(
  context: FunctionContext,
  params: RouteParams,
  _query: Record<string, string>
): Promise<unknown> {
  const { req, res, log, error: logError } = context;

  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = params.chatId;
    log(`Deleting chat: ${chatId} for user: ${userId}`);

    const chatService = new ChatService({ log, error: logError });
    const result = await chatService.deleteChatForUser(chatId, userId);

    log(`Deleted chat resources: ${JSON.stringify(result.deletedResources)}`);

    return sendSuccess(res, result);
  } catch (error) {
    return sendHandledError(res, error);
  }
}
