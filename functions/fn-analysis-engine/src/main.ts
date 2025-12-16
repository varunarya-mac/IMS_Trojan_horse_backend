/**
 * Analysis Engine - Entry Point
 *
 * Appwrite function for AI-powered refrigeration data analysis.
 * This function is called by fn-job-worker for background processing.
 *
 * Actions:
 *   analyze        - Analyze CSV data and generate insights
 *   semantic_check - Layer 2 guardrail for content filtering
 *   generate_graph - Generate chart visualization
 */

import type {
  FunctionContext,
  AnalysisEngineRequest,
  AnalysisEngineResponse,
  AnalysisResult,
  SemanticCheckResult,
  GraphResult,
} from './types.js';
import { OpenAIService } from './services/openai.service.js';
import { GuardrailService } from './services/guardrail.service.js';
import { GraphGeneratorService } from './services/graph-generator.service.js';
import { REFRIGERATION_ANALYSIS_SYSTEM_PROMPT } from './prompts/system.prompt.js';
import { buildAnalysisPrompt, buildSummaryExtractionPrompt } from './prompts/analysis.prompt.js';
import { REFERENCE_DOCUMENT } from './data/reference-document.js';

/**
 * Parse request body
 */
function parseRequest(body: string): AnalysisEngineRequest | null {
  try {
    if (!body || body === '') return null;
    return JSON.parse(body) as AnalysisEngineRequest;
  } catch {
    return null;
  }
}

/**
 * Send response
 */
function sendResponse(
  res: FunctionContext['res'],
  response: AnalysisEngineResponse,
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
      action: 'error',
      error: { code, message, details },
    },
    status
  );
}

/**
 * Handle analyze action
 */
async function handleAnalyze(
  context: FunctionContext,
  request: AnalysisEngineRequest
): Promise<AnalysisEngineResponse> {
  const { log } = context;
  const { userQuestion, csvData } = request;

  if (!csvData) {
    return {
      success: false,
      action: 'analyze',
      error: {
        code: 'MISSING_CSV_DATA',
        message: 'CSV data is required for analysis',
      },
    };
  }

  const startTime = Date.now();
  log(`Starting analysis for question: ${userQuestion.substring(0, 100)}...`);

  // Initialize services
  const openai = new OpenAIService();
  const guardrail = new GuardrailService(openai);

  // Sanitize user input
  const sanitizedQuestion = guardrail.sanitizeInput(userQuestion);

  // Build system prompt with reference document
  const systemPrompt = `${REFRIGERATION_ANALYSIS_SYSTEM_PROMPT}\n\n## Reference Knowledge\n${REFERENCE_DOCUMENT}`;

  // Build user prompt with CSV data
  const userPrompt = buildAnalysisPrompt(sanitizedQuestion, csvData);

  log(`Sending request to OpenAI (${openai.getModelInfo().analysisModel})`);

  // Get AI analysis
  const analysisResponse = await openai.analyzeData(systemPrompt, userPrompt);
  log(`Received analysis response: ${analysisResponse.content.length} chars`);

  // Validate output
  const validation = await guardrail.validateOutput(analysisResponse.content);
  if (!validation.isValid) {
    log(`Output validation warnings: ${validation.issues.join(', ')}`);
  }

  // Extract structured summary
  log('Extracting structured summary');
  const summaryPrompt = buildSummaryExtractionPrompt(analysisResponse.content);
  const summaryData = await openai.extractStructuredData<AnalysisResult['summaryData']>(
    summaryPrompt,
    'SummaryData'
  );

  // Check if graph is recommended
  if (!summaryData.graphRecommendation && csvData.summary) {
    const graphRec = await openai.getGraphRecommendation(csvData.summary, sanitizedQuestion);
    if (graphRec) {
      summaryData.graphRecommendation = graphRec;
    }
  }

  const processingTime = Date.now() - startTime;
  log(`Analysis completed in ${processingTime}ms`);

  const result: AnalysisResult = {
    content: analysisResponse.content,
    summaryData,
    tokenUsage: analysisResponse.usage,
    processingTime,
  };

  return {
    success: true,
    action: 'analyze',
    data: result,
  };
}

/**
 * Handle semantic_check action (Layer 2 guardrail)
 */
async function handleSemanticCheck(
  context: FunctionContext,
  request: AnalysisEngineRequest
): Promise<AnalysisEngineResponse> {
  const { log } = context;
  const { userQuestion } = request;

  log(`Performing semantic check on: ${userQuestion.substring(0, 50)}...`);

  const openai = new OpenAIService();
  const guardrail = new GuardrailService(openai);

  const result = await guardrail.checkQuestion(userQuestion);

  log(`Semantic check result: allowed=${result.allowed}, confidence=${result.confidence}`);

  return {
    success: true,
    action: 'semantic_check',
    data: result,
  };
}

/**
 * Handle generate_graph action
 */
async function handleGenerateGraph(
  context: FunctionContext,
  request: AnalysisEngineRequest
): Promise<AnalysisEngineResponse> {
  const { log } = context;
  const { graphConfig, messageId } = request;

  if (!graphConfig) {
    return {
      success: false,
      action: 'generate_graph',
      error: {
        code: 'MISSING_GRAPH_CONFIG',
        message: 'Graph configuration is required',
      },
    };
  }

  log(`Generating ${graphConfig.type} graph: ${graphConfig.title}`);

  const graphGenerator = new GraphGeneratorService();

  // Validate config
  const validation = graphGenerator.validateConfig(graphConfig);
  if (!validation.isValid) {
    return {
      success: false,
      action: 'generate_graph',
      error: {
        code: 'INVALID_GRAPH_CONFIG',
        message: 'Invalid graph configuration',
        details: validation.errors,
      },
    };
  }

  // Generate and upload graph
  const result = await graphGenerator.generateAndUpload(
    graphConfig,
    `graph-${messageId}`
  );

  log(`Graph generated: ${result.graphImageId}`);

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

  log(`Analysis Engine: ${req.method} ${req.path}`);

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
    let response: AnalysisEngineResponse;

    switch (request.action) {
      case 'analyze':
        response = await handleAnalyze(context, request);
        break;
      case 'semantic_check':
        response = await handleSemanticCheck(context, request);
        break;
      case 'generate_graph':
        response = await handleGenerateGraph(context, request);
        break;
      default:
        return sendError(res, 'INVALID_ACTION', `Unknown action: ${request.action}`, 400);
    }

    return sendResponse(res, response, response.success ? 200 : 400);
  } catch (error) {
    logError(`Error in Analysis Engine: ${error instanceof Error ? error.message : String(error)}`);

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('OPENAI_API_KEY')) {
        return sendError(res, 'CONFIG_ERROR', 'OpenAI API key not configured', 500);
      }
      if (error.message.includes('rate limit')) {
        return sendError(res, 'RATE_LIMITED', 'API rate limit exceeded', 429);
      }
    }

    return sendError(
      res,
      'PROCESSING_ERROR',
      error instanceof Error ? error.message : 'An error occurred during analysis',
      500
    );
  }
}
