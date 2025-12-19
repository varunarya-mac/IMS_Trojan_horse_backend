/**
 * Alarm Versions Handler
 * Handles version history and rollback operations
 */

import { z } from 'zod';
import type { FunctionContext, RouteParams } from '../types.js';
import { getUserContext } from '../types.js';
import { sendSuccess, handleError, parseBody } from '../utils/response.js';
import { VersioningService } from '@lib/services/versioning.service.js';
import { AuditService } from '@lib/services/audit.service.js';
import { ValidationError } from '@lib/utils/errors.js';

// Request schemas
const RollbackRequestSchema = z.object({
  targetVersion: z.number().int().positive(),
  reason: z.string().max(512).optional(),
});

/**
 * GET /alarm-patterns/:key/versions
 * Get version history for an alarm pattern
 */
export async function getAlarmVersions(
  context: FunctionContext,
  params: RouteParams,
  query: Record<string, string>
): Promise<void> {
  const { res, log, error: logError } = context;

  try {
    const alarmPatternKey = params.key;
    const includeAudit = query.includeAudit === 'true';

    log(`Fetching version history for: ${alarmPatternKey}`);

    const versioningService = new VersioningService();
    const versionHistory = await versioningService.getVersionHistory(alarmPatternKey);

    log(`Found ${versionHistory.versions.length} versions`);

    const response: Record<string, unknown> = {
      alarmPatternKey: versionHistory.alarmPatternKey,
      currentVersion: versionHistory.currentVersion,
      versions: versionHistory.versions,
    };

    // Include audit info if requested
    if (includeAudit) {
      const auditService = new AuditService();
      const audit = await auditService.getChangeSummary(alarmPatternKey);
      response.audit = audit;
    }

    return sendSuccess(res, response);
  } catch (error) {
    return handleError(res, error, logError);
  }
}

/**
 * POST /alarm-patterns/:key/rollback
 * Rollback alarm pattern to a specific version
 */
export async function rollbackAlarm(
  context: FunctionContext,
  params: RouteParams,
  _query: Record<string, string>
): Promise<void> {
  const { req, res, log, error: logError } = context;

  try {
    const alarmPatternKey = params.key;
    const body = parseBody(req.body);

    if (!body) {
      throw new ValidationError('Request body is required');
    }

    // Validate request
    const validation = RollbackRequestSchema.safeParse(body);
    if (!validation.success) {
      throw new ValidationError('Invalid request', { errors: validation.error.format() });
    }

    const { targetVersion, reason } = validation.data;
    const { userId } = getUserContext(req.headers);

    log(`Rolling back ${alarmPatternKey} to version ${targetVersion}`);

    const versioningService = new VersioningService();

    // Get current version first
    const currentPattern = await versioningService.getLatestVersion(alarmPatternKey);
    const currentVersion = currentPattern.version;

    // Perform rollback
    const newPattern = await versioningService.rollbackToVersion(
      alarmPatternKey,
      targetVersion,
      userId || 'system',
      reason
    );

    log(`Rolled back from version ${currentVersion} to ${targetVersion}, created version ${newPattern.version}`);

    return sendSuccess(res, {
      alarmPattern: newPattern,
      rolledBackFrom: currentVersion,
      rolledBackTo: targetVersion,
    });
  } catch (error) {
    return handleError(res, error, logError);
  }
}
