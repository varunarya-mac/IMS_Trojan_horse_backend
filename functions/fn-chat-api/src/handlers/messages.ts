/**
 * Messages Handler
 * Handles message operations including sending messages and file uploads
 */

import { z } from 'zod';
import type { FunctionContext, RouteParams } from '../types.js';
import { getAuthenticatedUserId } from '../types.js';
import { sendSuccess, sendError, sendHandledError, parseBody } from '../utils/response.js';
import { checkQuestionGuardrail, needsSemanticCheck } from '../middleware/guardrails.js';
import { ChatService } from '@lib/services/chat.service.js';
import { JobService } from '@lib/services/job.service.js';
import { MessageRepository } from '@lib/repositories/message.repository.js';
import { ChatRepository } from '@lib/repositories/chat.repository.js';
import { ValidationError, NotFoundError, ForbiddenError } from '@lib/utils/errors.js';
import type { MessageDTO, MessageRole, MessageContentType } from '@lib/types/message.types.js';
import type { MessageEntity } from '@lib/types/message.types.js';

// Request schemas
const SendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  csvFileId: z.string().optional(),
  csvFileName: z.string().optional(),
  csvFileSize: z.number().int().positive().optional(),
});

const ListMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

/**
 * POST /chats/:chatId/messages
 * Send a message in a chat session
 */
export async function sendMessage(
  context: FunctionContext,
  params: RouteParams,
  _query: Record<string, string>
): Promise<unknown> {
  const { req, res, log, error: logError } = context;

  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = params.chatId;
    log(`Sending message in chat: ${chatId} for user: ${userId}`);

    // Verify chat ownership
    const chatRepository = new ChatRepository({ log, error: logError });
    const chat = await chatRepository.findById(chatId);

    if (!chat) {
      throw new NotFoundError('Chat', chatId);
    }

    if (chat.userId !== userId) {
      throw new ForbiddenError('Access denied to this chat');
    }

    // Parse and validate request body
    const body = parseBody<Record<string, unknown>>(req);
    if (!body) {
      throw new ValidationError('Request body is required');
    }

    const validation = SendMessageSchema.safeParse(body);
    if (!validation.success) {
      throw new ValidationError('Invalid request body', { errors: validation.error.format() });
    }

    const { content, csvFileId, csvFileName, csvFileSize } = validation.data;

    // Layer 1 Guardrail: Check question content
    log('Running Layer 1 guardrail check');
    const guardrailResult = checkQuestionGuardrail(content);
    log(`Guardrail passed. Matched keywords: ${guardrailResult.matchedKeywords?.join(', ') || 'none'}`);

    // Check if semantic analysis is needed
    const requiresSemanticCheck = needsSemanticCheck(content);
    if (requiresSemanticCheck) {
      log('Question requires Layer 2 semantic check');
    }

    // Create user message
    const messageRepository = new MessageRepository({ log, error: logError });
    const userMessage = await messageRepository.createUserMessage(chatId, content);
    log(`Created user message: ${userMessage.$id}`);

    // Handle CSV file if provided
    if (csvFileId) {
      const chatService = new ChatService({ log, error: logError });
      await chatService.updateChatWithCSVInfo(chatId, {
        csvFileId,
        csvFileName: csvFileName || 'data.csv',
        csvFileSize: csvFileSize || 0,
      });
      log(`Updated chat with CSV info: ${csvFileId}`);
    }

    // Determine if we need background processing
    const hasCSV = csvFileId || chat.csvFileId;

    if (hasCSV) {
      // Create placeholder assistant message
      const assistantMessage = await messageRepository.createAssistantPlaceholder(
        chatId,
        'Analyzing your refrigeration data...'
      );
      log(`Created assistant placeholder: ${assistantMessage.$id}`);

      // Update chat status to processing
      await chatRepository.updateStatus(chatId, 'processing');

      // Create processing job
      const jobService = new JobService({ log, error: logError });
      const job = await jobService.createJob({
        chatId,
        messageId: assistantMessage.$id,
        userId,
        jobType: 'csv_analysis',
        userQuestion: content,
        csvFileId: csvFileId || chat.csvFileId!,
      });
      log(`Created processing job: ${job.$id}`);

      // Return response with job info
      return sendSuccess(
        res,
        {
          userMessage: toMessageDTO(userMessage),
          assistantMessage: toMessageDTO(assistantMessage),
          job: {
            jobId: job.$id,
            status: job.status,
            progress: job.progress,
            progressMessage: job.progressMessage,
          },
          processing: true,
          estimatedTime: jobService.estimateProcessingTime(csvFileSize || chat.csvFileSize),
        },
        202
      );
    } else {
      // No CSV context - simple text response
      // For now, create a placeholder that will be processed immediately
      const assistantMessage = await messageRepository.createAssistantPlaceholder(
        chatId,
        'I can help you analyze refrigeration data. Please upload a CSV file with your telemetry data, and I\'ll provide insights on temperature patterns, alarms, and recommendations.'
      );

      return sendSuccess(
        res,
        {
          userMessage: toMessageDTO(userMessage),
          assistantMessage: toMessageDTO(assistantMessage),
          processing: false,
        },
        201
      );
    }
  } catch (error) {
    return sendHandledError(res, error);
  }
}

/**
 * GET /chats/:chatId/messages
 * List messages in a chat session
 */
export async function listMessages(
  context: FunctionContext,
  params: RouteParams,
  query: Record<string, string>
): Promise<unknown> {
  const { req, res, log, error: logError } = context;

  try {
    const userId = getAuthenticatedUserId(req);
    const chatId = params.chatId;
    log(`Listing messages for chat: ${chatId} for user: ${userId}`);

    // Verify chat ownership
    const chatRepository = new ChatRepository({ log, error: logError });
    const chat = await chatRepository.findById(chatId);

    if (!chat) {
      throw new NotFoundError('Chat', chatId);
    }

    if (chat.userId !== userId) {
      throw new ForbiddenError('Access denied to this chat');
    }

    // Validate query params
    const validation = ListMessagesQuerySchema.safeParse(query);
    if (!validation.success) {
      throw new ValidationError('Invalid query parameters', { errors: validation.error.format() });
    }

    const { limit, offset } = validation.data;
    const page = Math.floor(offset / limit) + 1;

    // Get messages
    const messageRepository = new MessageRepository({ log, error: logError });
    const result = await messageRepository.findByChatId(chatId, { page, limit });

    const messages = result.documents.map(toMessageDTO);
    log(`Found ${messages.length} messages (total: ${result.total})`);

    return sendSuccess(res, messages, 200, {
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    return sendHandledError(res, error);
  }
}

/**
 * Convert MessageEntity to MessageDTO
 */
function toMessageDTO(message: MessageEntity): MessageDTO {
  return {
    id: message.$id,
    chatId: message.chatId,
    role: message.role as MessageRole,
    content: message.content,
    contentType: message.contentType as MessageContentType,
    summaryData: message.summaryData ? JSON.parse(message.summaryData) : null,
    graphImageId: message.graphImageId,
    datapointsData: message.datapointsData ? JSON.parse(message.datapointsData) : null,
    processingTime: message.processingTime,
    tokenUsage: message.tokenUsage ? JSON.parse(message.tokenUsage) : null,
    createdAt: message.$createdAt,
    graphImageUrl: null
  };
}
