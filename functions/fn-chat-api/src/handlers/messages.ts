/**
 * Messages Handler
 * Handles message operations with synchronous processing via fn-chat-processor
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
import type { MessageDTO, MessageRole, MessageContentType, SummaryData, Summary, Recommendation, Datapoint } from '@lib/types/message.types.js';
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
 * Send a message in a chat session - processes synchronously
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

    try {
      // Invoke processor synchronously (with or without CSV)
      log(`Invoking chat processor... (hasCSV: ${hasCSVContext})`);
      const processor = new ProcessorInvokerService();
      const result = await processor.processMessage({
        chatId,
        messageId: assistantMessage.$id,
        userQuestion: content,
        csvData: processingContext.csvData || undefined,
        messageContext: processingContext.messageContext,
      });
      log(`Processor completed in ${result.processingTimeMs}ms`);

      // Build summary data with proper types
      const summary: Summary = {
        title: 'Analysis Results',
        description: result.content.substring(0, 500),
        recommendedActions: result.recommendations?.map(r => r.title) || [],
      };

      const recommendations: Recommendation[] = (result.recommendations || []).map(r => ({
        title: r.title,
        description: r.description,
        confidence: r.priority === 'high' ? 90 : r.priority === 'medium' ? 70 : 50,
        recommendedActions: [r.description],
        evidenceTrail: [],
      }));

      const datapoints: Datapoint[] = (result.dataPoints || []).map(dp => ({
        name: dp.label,
        metric: `${dp.value}${dp.unit ? ` ${dp.unit}` : ''}`,
        status: 'Okay' as const,
        history: null,
      }));

      const summaryData: SummaryData = {
        summary,
        recommendations,
        datapoints,
        graphRecommendation: null,
      };

      // Determine content type (only 'summary' or 'graph' with optional graph)
      const contentType: MessageContentType = result.graph ? 'graph' : 'summary';

      // Update assistant message with result
      await messageRepository.updateWithAnalysisResults(assistantMessage.$id, {
        content: result.content,
        contentType,
        summaryData: JSON.stringify(summaryData),
        graphImageId: result.graph?.graphImageId || null,
        datapointsData: datapoints.length > 0 ? JSON.stringify(datapoints) : null,
        processingTime: result.processingTimeMs,
      });

      // Update chat status to completed
      await chatRepository.updateStatus(chatId, 'completed');

      // Get updated assistant message
      const updatedAssistantMessage = await messageRepository.findById(assistantMessage.$id);

      return sendSuccess(
        res,
        {
          userMessage: toMessageDTO(userMessage),
          assistantMessage: toMessageDTO(updatedAssistantMessage!),
          processingTimeMs: result.processingTimeMs,
        },
        201
      );
    } catch (processingError) {
      logError(`Processing failed: ${processingError instanceof Error ? processingError.message : String(processingError)}`);

      // Update message with error
      await messageRepository.updateWithError(
        assistantMessage.$id,
        'I encountered an error while analyzing your data. Please try again or contact support if the issue persists.'
      );

      // Update chat status to error
      await chatRepository.updateStatus(chatId, 'error');

      // Get updated assistant message
      const updatedAssistantMessage = await messageRepository.findById(assistantMessage.$id);

      return sendSuccess(
        res,
        {
          userMessage: toMessageDTO(userMessage),
          assistantMessage: toMessageDTO(updatedAssistantMessage!),
          error: {
            code: 'PROCESSING_ERROR',
            message: processingError instanceof Error ? processingError.message : 'Processing failed',
          },
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
