/**
 * Disciplines Handler
 * GET /disciplines - List all disciplines with their types
 */

import type { FunctionContext, RouteParams } from '../types.js';
import { sendSuccess, handleError } from '../utils/response.js';
import { DisciplineRepository } from '../../../../lib/repositories/discipline.repository.js';

/**
 * GET /disciplines
 * Returns all disciplines with their associated types
 */
export async function getDisciplines(
  context: FunctionContext,
  _params: RouteParams,
  _query: Record<string, string>
): Promise<void> {
  const { res, log, error: logError } = context;

  try {
    log('Fetching all disciplines with types');

    const disciplineRepo = new DisciplineRepository();
    // findAllWithTypes already returns DisciplineDTO[]
    const disciplines = await disciplineRepo.findAllWithTypes();

    log(`Found ${disciplines.length} disciplines`);

    sendSuccess(res, { disciplines });
  } catch (error) {
    handleError(res, error, logError);
  }
}
