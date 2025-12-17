/**
 * Chat Processor - Entry Point
 *
 * Appwrite function for processing chat messages with RAG and AI analysis.
 * Called synchronously by fn-chat-api.
 *
 * Actions:
 *   process_message - Process user message with CSV data and generate response
 *   generate_graph  - Generate a graph from CSV data
 */

import type {
  FunctionContext,
  ChatProcessorRequest,
  ChatProcessorResponse,
  ProcessMessageResult,
  GenerateGraphResult,
  Recommendation,
  DataPoint,
  GraphConfig,
} from './types.js';
import { CSVProcessorService } from './services/csv-processor.service.js';
import { CSVSamplerService } from './services/csv-sampler.service.js';
import { OpenAIService } from './services/openai.service.js';
import { RAGService } from './services/rag.service.js';
import { GuardrailService } from './services/guardrail.service.js';
import { GraphGeneratorService } from './services/graph-generator.service.js';
import { REFRIGERATION_ANALYSIS_PROMPT, buildAnalysisPrompt } from './prompts/system.prompt.js';

/**
 * Get environment configuration
 */
function getConfig() {
  return {
    appwrite: {
      endpoint: process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1',
      projectId: process.env.APPWRITE_PROJECT_ID || '',
      apiKey: process.env.APPWRITE_API_KEY || '',
    },
    vectorSearch: {
      functionId: process.env.FN_VECTOR_SEARCH_ID || 'fn-vector-search',
    },
    storage: {
      bucketId: process.env.REFRIGERATION_BUCKET_ID || 'refrigeration-files',
    },
  };
}

/**
 * Parse request body
 */
function parseRequest(body: string): ChatProcessorRequest | null {
  try {
    if (!body || body === '') return null;
    return JSON.parse(body) as ChatProcessorRequest;
  } catch {
    return null;
  }
}

/**
 * Send response
 */
function sendResponse(
  res: FunctionContext['res'],
  response: ChatProcessorResponse,
  status: number = 200
): unknown {
  return res.json(response, status, {
    'Access-Control-Allow-Origin': '*',
  });
}

/**
 * Send error response
 */
function sendError(
  res: FunctionContext['res'],
  code: string,
  message: string,
  status: number = 500,
  details?: unknown
): unknown {
  return sendResponse(
    res,
    {
      success: false,
      action: 'process_message',
      error: { code, message, details },
    },
    status
  );
}

/**
 * Handle process_message action
 */
async function handleProcessMessage(
  context: FunctionContext,
  request: ChatProcessorRequest
): Promise<ChatProcessorResponse> {
  const { log, error: logError } = context;
  const startTime = Date.now();

  const { userQuestion, csvData, messageContext } = request;

  if (!userQuestion) {
    return {
      success: false,
      action: 'process_message',
      error: { code: 'MISSING_QUESTION', message: 'User question is required' },
    };
  }

  log(`Processing message: "${userQuestion.substring(0, 50)}..."`);

  const config = getConfig();

  // Initialize services
  const openai = new OpenAIService();
  const guardrail = new GuardrailService(openai);
  const csvProcessor = new CSVProcessorService();

  // Sanitize input
  const sanitizedQuestion = guardrail.sanitizeInput(userQuestion);

  // Layer 2 Guardrail: Semantic check
  log('Running semantic guardrail check...');
  const semanticCheck = await guardrail.checkQuestion(sanitizedQuestion);

  if (!semanticCheck.allowed) {
    log(`Question blocked by guardrail: ${semanticCheck.reason}`);
    return {
      success: true,
      action: 'process_message',
      data: {
        content: semanticCheck.suggestion ||
          "I can only help with questions about refrigeration systems, temperature monitoring, and cold chain management. Please ask a question related to these topics.",
        recommendations: [],
        dataPoints: [],
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  // Initialize RAG service
  const ragService = new RAGService({
    functionId: config.vectorSearch.functionId,
    endpoint: config.appwrite.endpoint,
    projectId: config.appwrite.projectId,
    apiKey: config.appwrite.apiKey,
  });

  // Smart RAG with fallback logic
  let ragContext: string[] = [];
  let usedSummaryFallback = false;

  // Check if question is generic (should use summary directly)
  const isGeneric = ragService.isGenericQuestion(sanitizedQuestion);

  if (isGeneric) {
    log('Generic question detected, fetching document summary...');
    const summary = await ragService.getSummary();
    if (summary) {
      ragContext = [summary];
      usedSummaryFallback = true;
      log('Using pre-computed document summary');
    }
  } else {
    // Search for relevant domain knowledge
    log('Searching RAG for relevant context...');
    const ragResults = await ragService.search(sanitizedQuestion, 5, 0.5);
    log(`Found ${ragResults.length} RAG results`);

    // Check if results have low confidence - use summary fallback
    if (ragService.shouldUseFallback(ragResults, 0.6)) {
      log('Low confidence RAG results, fetching document summary as fallback...');
      const summary = await ragService.getSummary();
      if (summary) {
        // Combine summary with any results we got (even low confidence)
        const partialContext = ragService.getContextForPrompt(ragResults);
        ragContext = [summary, ...partialContext];
        usedSummaryFallback = true;
        log('Using document summary with partial RAG results');
      } else {
        ragContext = ragService.getContextForPrompt(ragResults);
      }
    } else {
      ragContext = ragService.getContextForPrompt(ragResults);
    }
  }

  log(`RAG context ready: ${ragContext.length} items, summary fallback: ${usedSummaryFallback}`);

  // Prepare CSV summary
  let csvSummary = 'No CSV data provided.';
  if (csvData && csvData.rows.length > 0) {
    const stats = csvProcessor.calculateColumnStats(csvData.headers, csvData.rows);
    csvSummary = csvProcessor.createSummaryForAI(csvData.headers, csvData.rows, stats);
    log(`CSV summary created: ${csvData.rows.length} rows, ${csvData.headers.length} columns`);
  }

  // Build analysis prompt
  const analysisPrompt = buildAnalysisPrompt(
    sanitizedQuestion,
    csvSummary,
    messageContext || []
  );

  // Call OpenAI with RAG context
  log('Calling OpenAI for analysis...');
  const aiResponse = await openai.analyzeDataWithRAG(
    REFRIGERATION_ANALYSIS_PROMPT,
    analysisPrompt,
    ragContext
  );
  log(`AI response received: ${aiResponse.usage.totalTokens} tokens`);

  // Extract structured data from response
  const structured = await openai.extractStructuredResponse(aiResponse.content);

  // Validate output
  const validation = guardrail.validateOutput(aiResponse.content);
  if (!validation.isValid) {
    logError(`Output validation issues: ${validation.issues.join(', ')}`);
  }

  // Check if graph should be generated
  let graphResult = undefined;
  if (csvData && csvData.rows.length > 0) {
    log('Checking if graph should be generated...');
    const graphRecommendation = await openai.getGraphRecommendation(csvSummary, sanitizedQuestion);

    if (graphRecommendation) {
      log(`Generating ${graphRecommendation.type} graph: ${graphRecommendation.title}`);

      try {
        const graphGenerator = new GraphGeneratorService({
          endpoint: config.appwrite.endpoint,
          projectId: config.appwrite.projectId,
          apiKey: config.appwrite.apiKey,
          bucketId: config.storage.bucketId,
        });

        const graphConfig: GraphConfig = {
          type: graphRecommendation.type,
          title: graphRecommendation.title,
          xAxis: { column: graphRecommendation.xColumn },
          yAxis: { columns: graphRecommendation.yColumns },
          data: csvData.rows.slice(0, 500), // Limit data points for graph
        };

        const configValidation = graphGenerator.validateConfig(graphConfig);
        if (configValidation.isValid) {
          graphResult = await graphGenerator.generateAndUpload(
            graphConfig,
            `graph-${request.chatId || 'unknown'}`
          );
          log(`Graph generated: ${graphResult.graphImageId}`);
        } else {
          logError(`Graph config invalid: ${configValidation.errors.join(', ')}`);
        }
      } catch (graphError) {
        logError(`Graph generation failed: ${graphError instanceof Error ? graphError.message : String(graphError)}`);
      }
    }
  }

  const processingTimeMs = Date.now() - startTime;
  log(`Message processed in ${processingTimeMs}ms`);

  const result: ProcessMessageResult = {
    content: aiResponse.content,
    recommendations: structured.recommendations.map(r => ({
      priority: r.priority as 'high' | 'medium' | 'low',
      title: r.title,
      description: r.description,
    })),
    dataPoints: structured.dataPoints.map(d => ({
      label: d.label,
      value: d.value,
      unit: d.unit,
    })),
    graph: graphResult,
    ragContext: ragContext.length > 0 ? ragContext : undefined,
    processingTimeMs,
  };

  return {
    success: true,
    action: 'process_message',
    data: result,
  };
}

/**
 * Handle generate_graph action
 */
async function handleGenerateGraph(
  context: FunctionContext,
  request: ChatProcessorRequest
): Promise<ChatProcessorResponse> {
  const { log, error: logError } = context;

  const { graphConfig } = request;

  if (!graphConfig) {
    return {
      success: false,
      action: 'generate_graph',
      error: { code: 'MISSING_CONFIG', message: 'Graph configuration is required' },
    };
  }

  log(`Generating graph: ${graphConfig.title}`);

  const config = getConfig();

  const graphGenerator = new GraphGeneratorService({
    endpoint: config.appwrite.endpoint,
    projectId: config.appwrite.projectId,
    apiKey: config.appwrite.apiKey,
    bucketId: config.storage.bucketId,
  });

  // Validate config
  const validation = graphGenerator.validateConfig(graphConfig);
  if (!validation.isValid) {
    return {
      success: false,
      action: 'generate_graph',
      error: {
        code: 'INVALID_CONFIG',
        message: 'Invalid graph configuration',
        details: validation.errors,
      },
    };
  }

  const graph = await graphGenerator.generateAndUpload(
    graphConfig,
    `graph-${request.chatId || 'manual'}`
  );

  log(`Graph generated: ${graph.graphImageId}`);

  const result: GenerateGraphResult = { graph };

  return {
    success: true,
    action: 'generate_graph',
    data: result,
  };
}

/**
 * Main function handler
 */
export default async function (context: FunctionContext): Promise<unknown> {
  const { req, res, log, error: logError } = context;

  log(`Chat Processor: ${req.method} ${req.path}`);

  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    return res.send('', 204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Only POST method is allowed', 405);
  }

  // Parse request
  const request = parseRequest(req.body);
  if (!request) {
    return sendError(res, 'INVALID_REQUEST', 'Invalid request body', 400);
  }

  if (!request.action) {
    return sendError(res, 'MISSING_ACTION', 'Action is required', 400);
  }

  try {
    let response: ChatProcessorResponse;

    switch (request.action) {
      case 'process_message':
        response = await handleProcessMessage(context, request);
        break;
      case 'generate_graph':
        response = await handleGenerateGraph(context, request);
        break;
      default:
        return sendError(res, 'INVALID_ACTION', `Unknown action: ${request.action}`, 400);
    }

    return sendResponse(res, response, response.success ? 200 : 400);
  } catch (error) {
    logError(`Error in Chat Processor: ${error instanceof Error ? error.message : String(error)}`);
    return sendError(
      res,
      'PROCESSING_ERROR',
      error instanceof Error ? error.message : 'An error occurred',
      500
    );
  }
}
