/**
 * Messages Handler
 * Handles message operations with async processing via fn-chat-processor
 * Uses async execution to avoid 15s timeout on Appwrite free tier
 * Frontend should subscribe to Realtime updates for message completion
 */

import { z } from 'zod';
import type { FunctionContext, RouteParams } from '../types.js';
import { getAuthenticatedUserId } from '../types.js';
import { sendSuccess, sendError, sendHandledError, parseBody } from '../utils/response.js';
import { checkQuestionGuardrail, checkCSVGuardrail } from '../middleware/guardrails.js';
import { ChatService } from '@lib/services/chat.service.js';
import { MessageRepository } from '@lib/repositories/message.repository.js';
import { ChatRepository } from '@lib/repositories/chat.repository.js';
import { ValidationError, NotFoundError, ForbiddenError } from '@lib/utils/errors.js';
import type { MessageDTO, MessageRole, MessageContentType } from '@lib/types/message.types.js';
import type { MessageEntity } from '@lib/types/message.types.js';
import { ProcessorInvokerService } from '../services/processor-invoker.js';
import { ContextService } from '../services/context.service.js';

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
 * Send a message in a chat session - processes asynchronously
 * Returns immediately with placeholder, processor updates DB when done
 * Frontend should subscribe to Realtime for message updates
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

    // Create user message
    const messageRepository = new MessageRepository({ log, error: logError });
    const userMessage = await messageRepository.createUserMessage(chatId, content);
    log(`Created user message: ${userMessage.$id}`);
   log(`=========CSV info: ${csvFileId}`);
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

    // Get context for processing
    const contextService = new ContextService({ log, error: logError });
    const processingContext = await contextService.getContextForProcessing(
      chatId,
      csvFileId || chat.csvFileId || undefined
    );
log(`========processingContext==: ${processingContext.csvData}`);
    // Check if we have CSV context
    const hasCSVContext = processingContext.csvData !== null;

    // Validate CSV columns if CSV is provided (Layer 1 CSV Guardrail)
    if (hasCSVContext && processingContext.csvData) {
      log('Running CSV guardrail check');
      const csvGuardrailResult = checkCSVGuardrail(processingContext.csvData.headers);
      log(`CSV guardrail passed. Matched columns: ${csvGuardrailResult.matchedKeywords?.join(', ') || 'none'}`);
    }

    // Update chat status to processing
    await chatRepository.updateStatus(chatId, 'processing');

    // Create placeholder assistant message
    const assistantMessage = await messageRepository.createAssistantPlaceholder(
      chatId,
      hasCSVContext ? 'Analyzing your refrigeration data...' : 'Processing your question...'
    );
    log(`Created assistant placeholder: ${assistantMessage.$id}`);

    // Start async processing (fire and forget)
    // Processor will update the message in DB when done
    // Frontend should subscribe to Realtime updates for this message
    try {
      log(`Starting ASYNC chat processor... (hasCSV: ${hasCSVContext})`);
      const processor = new ProcessorInvokerService();
      const asyncResult = await processor.startProcessingAsync({
        chatId,
        messageId: assistantMessage.$id,
        userQuestion: content,
        csvData: processingContext.csvData || undefined,
        messageContext: processingContext.messageContext,
      });
      log(`Async processing started: executionId=${asyncResult.executionId}`);
    } catch (startError) {
      // If we can't even start the processor, update message with error
      logError(`Failed to start processor: ${startError instanceof Error ? startError.message : String(startError)}`);
      await messageRepository.updateWithError(
        assistantMessage.$id,
        'Failed to start processing. Please try again.'
      );
      await chatRepository.updateStatus(chatId, 'error');
    }

    // Return immediately with placeholder (HTTP 202 Accepted)
    // Frontend will receive updates via Realtime subscription
    return sendSuccess(
      res,
      {
        userMessage: toMessageDTO(userMessage),
        assistantMessage: toMessageDTO(assistantMessage),
        status: 'processing',
      },
      202 // Accepted - processing started
    );
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
  const endpoint = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
  const projectId = process.env.APPWRITE_PROJECT_ID || '';
  const bucketId = process.env.REFRIGERATION_BUCKET_ID || 'refrigeration-files';

  let graphImageUrl = null;
  if (message.graphImageId) {
    graphImageUrl = `${endpoint}/storage/buckets/${bucketId}/files/${message.graphImageId}/view?project=${projectId}`;
  }

  return {
    id: message.$id,
    chatId: message.chatId,
    role: message.role as MessageRole,
    content: message.content,
    contentType: message.contentType as MessageContentType,
    summaryData: message.summaryData ? JSON.parse(message.summaryData) : null,
    graphImageId: message.graphImageId,
    graphImageUrl,
    datapointsData: message.datapointsData ? JSON.parse(message.datapointsData) : null,
    processingTime: message.processingTime,
    tokenUsage: message.tokenUsage ? JSON.parse(message.tokenUsage) : null,
    createdAt: message.$createdAt,
  };
}
