/**
 * Alarm Patterns Handler
 * Handles CRUD operations for alarm patterns
 */

import { z } from 'zod';
import type { FunctionContext, RouteParams } from '../types.js';
import { getUserContext } from '../types.js';
import { sendSuccess, handleError, getRequestData, parseBody } from '../utils/response.js';
import { AlarmFlowRepository } from '@lib/repositories/alarm-flow.repository.js';
import { VersioningService } from '@lib/services/versioning.service.js';
import { ValidationError, NotFoundError } from '@lib/utils/errors.js';
import {
  CreateAlarmPatternSchema,
  UpdateAlarmPatternSchema,
  ProgramModuleSchema,
} from '@lib/utils/validation.js';

// Request schemas for this handler
const GetAlarmFlowsRequestSchema = z.object({
  disciplineId: z.string().min(1).optional(),
});

const GetAlarmPatternRequestSchema = z.object({
  version: z.coerce.number().int().positive().optional(),
});

/**
 * GET /alarm-flows
 * Get alarm flows by discipline (optional filter)
 * - If disciplineId provided: returns alarm flows for that discipline
 * - If no disciplineId: returns all alarm flows grouped by discipline
 */
export async function getAlarmFlows(
  context: FunctionContext,
  _params: RouteParams,
  query: Record<string, string>
): Promise<unknown> {
  const { req, res, log, error: logError } = context;

  try {
    const data = getRequestData<{ disciplineId?: string }>(req.body, query);

    // Validate request (disciplineId is optional)
    const validation = GetAlarmFlowsRequestSchema.safeParse(data);
    if (!validation.success) {
      throw new ValidationError('Invalid request', { errors: validation.error.format() });
    }

    const { disciplineId } = validation.data;
    const alarmFlowRepo = new AlarmFlowRepository();

    let result;
    if (disciplineId) {
      log(`Fetching alarm flows for discipline: ${disciplineId}`);
      result = [await alarmFlowRepo.getAlarmFlowsByDiscipline(disciplineId)];
    } else {
      log('Fetching all alarm flows');
      result = await alarmFlowRepo.getAllAlarmFlows();
    }

    log(`Found ${result.length} discipline(s) with alarm flows`);

    return sendSuccess(res, result);
  } catch (error) {
    return handleError(res, error, logError);
  }
}

/**
 * GET /alarm-patterns/:key
 * Get a specific alarm pattern (optionally by version)
 */
export async function getAlarmPattern(
  context: FunctionContext,
  params: RouteParams,
  query: Record<string, string>
): Promise<void> {
  const { res, log, error: logError } = context;

  try {
    const alarmPatternKey = params.key;
    const version = query.version ? parseInt(query.version, 10) : undefined;

    log(`Fetching alarm pattern: ${alarmPatternKey}${version ? ` (version ${version})` : ''}`);

    const versioningService = new VersioningService();

    let pattern;
    if (version !== undefined) {
      pattern = await versioningService.getSpecificVersion(alarmPatternKey, version);
    } else {
      pattern = await versioningService.getLatestVersion(alarmPatternKey);
    }

    // pattern is already a DTO from the versioning service
    return sendSuccess(res, { alarmPattern: pattern });
  } catch (error) {
    return handleError(res, error, logError);
  }
}

/**
 * POST /alarm-patterns
 * Create a new alarm pattern
 */
export async function createAlarmPattern(
  context: FunctionContext,
  _params: RouteParams,
  _query: Record<string, string>
): Promise<void> {
  const { req, res, log, error: logError } = context;

  try {
    const body = parseBody(req.body);
    if (!body) {
      throw new ValidationError('Request body is required');
    }

    // Create schema with disciplineTypeId for create requests
    const CreateRequestSchema = CreateAlarmPatternSchema.extend({
      disciplineTypeId: z.string().min(1),
    });

    // Validate request
    const validation = CreateRequestSchema.safeParse(body);
    if (!validation.success) {
      throw new ValidationError('Invalid request', { errors: validation.error.format() });
    }

    const { userId } = getUserContext(req.headers);
    const input = {
      ...validation.data,
      createdBy: userId || undefined,
    };

    log(`Creating alarm pattern: ${input.alarmId} for discipline type ${input.disciplineTypeId}`);

    const alarmFlowRepo = new AlarmFlowRepository();
    const pattern = await alarmFlowRepo.createAlarmPattern(input);

    log(`Created alarm pattern with key: ${pattern.alarmPatternKey}`);

    return sendSuccess(res, { alarmPattern: alarmFlowRepo.toDTO(pattern) }, 201);
  } catch (error) {
    return handleError(res, error, logError);
  }
}

/**
 * PUT /alarm-patterns/:key
 * Update an alarm pattern (creates new version)
 */
export async function updateAlarmPattern(
  context: FunctionContext,
  params: RouteParams,
  _query: Record<string, string>
): Promise<void> {
  const { req, res, log, error: logError } = context;

  try {
    const alarmPatternKey = params.key;
    const body = parseBody<Record<string, unknown>>(req.body);

    if (!body) {
      throw new ValidationError('Request body is required');
    }

    // Create a flexible update schema
    const UpdateRequestSchema = z.object({
      textExpr: z.string().min(1).max(512).optional(),
      genericFamily: z.string().min(1).max(64).optional(),
      genericId: z.string().min(1).max(128).optional(),
      trapPdu1: z.string().max(128).optional(),
      trapFlag: z.number().int().min(0).max(1).optional(),
      suppressionPeriod: z.number().min(0).optional(),
      programModules: z.array(ProgramModuleSchema).optional(),
      changeDescription: z.string().min(1).max(512).optional(),
    });

    // Validate request
    const validation = UpdateRequestSchema.safeParse(body);
    if (!validation.success) {
      throw new ValidationError('Invalid request', { errors: validation.error.format() });
    }

    const { userId } = getUserContext(req.headers);
    const { changeDescription, ...updates } = validation.data;

    log(`Updating alarm pattern: ${alarmPatternKey}`);

    const versioningService = new VersioningService();

    // Get current version first for comparison
    const currentPattern = await versioningService.getLatestVersion(alarmPatternKey);
    const currentVersion = currentPattern.version;

    // Generate change description if not provided
    let description = changeDescription;
    if (!description) {
      description = versioningService.generateChangeDescription(currentPattern, updates);
    }

    // Create new version with proper parameters
    const newPattern = await versioningService.createNewVersion(
      alarmPatternKey,
      updates,
      userId || 'system',
      description
    );

    log(`Updated alarm pattern to version ${newPattern.version}`);

    return sendSuccess(res, {
      alarmPattern: newPattern,
      previousVersion: currentVersion,
    });
  } catch (error) {
    return handleError(res, error, logError);
  }
}

/**
 * DELETE /alarm-patterns/:key
 * Soft delete an alarm pattern
 */
export async function deleteAlarmPattern(
  context: FunctionContext,
  params: RouteParams,
  _query: Record<string, string>
): Promise<void> {
  const { req, res, log, error: logError } = context;

  try {
    const alarmPatternKey = params.key;
    const { userId } = getUserContext(req.headers);

    log(`Deleting alarm pattern: ${alarmPatternKey}`);

    const versioningService = new VersioningService();
    await versioningService.softDelete(alarmPatternKey, userId || 'system');

    log(`Soft deleted alarm pattern: ${alarmPatternKey}`);

    return sendSuccess(res, {
      message: 'Alarm pattern deleted successfully',
      alarmPatternKey,
    });
  } catch (error) {
    return handleError(res, error, logError);
  }
}
