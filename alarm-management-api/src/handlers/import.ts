/**
 * Import Handler
 * Handles configuration import operations
 */

import { z } from 'zod';
import type { FunctionContext, RouteParams } from '../types.js';
import { sendSuccess, handleError, parseBody } from '../utils/response.js';
import { ImportService } from '../../../../lib/services/import.service.js';
import { ValidationError } from '../../../../lib/utils/errors.js';

// Request schema for import
const ImportRequestSchema = z.object({
  configs: z.array(z.string().min(1)),
  overwriteExisting: z.boolean().optional().default(false),
});

/**
 * POST /import
 * Import alarm configuration from JSON
 */
export async function importConfig(
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

    // Validate request
    const validation = ImportRequestSchema.safeParse(body);
    if (!validation.success) {
      throw new ValidationError('Invalid request', { errors: validation.error.format() });
    }

    const { configs, overwriteExisting } = validation.data;

    log(`Importing ${configs.length} configuration(s), overwrite: ${overwriteExisting}`);

    const importService = new ImportService();

    let result;
    if (configs.length === 1) {
      result = await importService.importConfig(configs[0], overwriteExisting);
    } else {
      result = await importService.importMultipleConfigs(configs, overwriteExisting);
    }

    log(`Import completed: ${JSON.stringify(result)}`);

    sendSuccess(res, result);
  } catch (error) {
    handleError(res, error, logError);
  }
}
