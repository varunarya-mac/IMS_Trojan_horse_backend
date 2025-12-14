/**
 * Classes Handler
 * Handles class configuration operations
 */

import { z } from 'zod';
import type { FunctionContext, RouteParams } from '../types.js';
import { sendSuccess, handleError, getRequestData, parseBody } from '../utils/response.js';
import { ClassRepository, FieldRepository } from '../../../../lib/repositories/class.repository.js';
import { ValidationError } from '../../../../lib/utils/errors.js';

// Request schemas
const GetClassesRequestSchema = z.object({
  disciplineTypeId: z.string().min(1),
  includeFields: z.boolean().optional().default(false),
});

// Update class schema matching the repository signature
const UpdateClassRequestSchema = z.object({
  description: z.string().max(256).optional(),
  defaultFlag: z.number().int().optional(),
  data: z.array(z.unknown()).optional(),
  patterns: z.array(z.object({
    pattern: z.string(),
    flags: z.number().int(),
  })).optional(),
});

/**
 * GET /classes
 * Get classes for a discipline type
 */
export async function getClasses(
  context: FunctionContext,
  _params: RouteParams,
  query: Record<string, string>
): Promise<void> {
  const { req, res, log, error: logError } = context;

  try {
    const data = getRequestData<{ disciplineTypeId?: string; includeFields?: string | boolean }>(req.body, query);

    // Convert string to boolean for includeFields
    const processedData = {
      ...data,
      includeFields: data.includeFields === 'true' || data.includeFields === true,
    };

    // Validate request
    const validation = GetClassesRequestSchema.safeParse(processedData);
    if (!validation.success) {
      throw new ValidationError('Invalid request', { errors: validation.error.format() });
    }

    const { disciplineTypeId, includeFields } = validation.data;
    log(`Fetching classes for discipline type: ${disciplineTypeId}`);

    const classRepo = new ClassRepository();
    const classes = await classRepo.getClassesByDisciplineType(disciplineTypeId);

    log(`Found ${classes.length} classes`);

    const response: Record<string, unknown> = { classes };

    // Include fields if requested
    if (includeFields) {
      const fieldRepo = new FieldRepository();
      const fields = await fieldRepo.getFieldsByDisciplineType(disciplineTypeId);
      response.fields = fields;
      log(`Found ${fields.length} fields`);
    }

    sendSuccess(res, response);
  } catch (error) {
    handleError(res, error, logError);
  }
}

/**
 * PUT /classes/:id
 * Update a class configuration
 */
export async function updateClass(
  context: FunctionContext,
  params: RouteParams,
  _query: Record<string, string>
): Promise<void> {
  const { req, res, log, error: logError } = context;

  try {
    const classId = params.id;
    const body = parseBody(req.body);

    if (!body) {
      throw new ValidationError('Request body is required');
    }

    // Validate request
    const validation = UpdateClassRequestSchema.safeParse(body);
    if (!validation.success) {
      throw new ValidationError('Invalid request', { errors: validation.error.format() });
    }

    log(`Updating class: ${classId}`);

    const classRepo = new ClassRepository();
    const updatedClass = await classRepo.updateClass(classId, validation.data);

    log(`Updated class: ${classId}`);

    sendSuccess(res, { class: classRepo.toDTO(updatedClass) });
  } catch (error) {
    handleError(res, error, logError);
  }
}
