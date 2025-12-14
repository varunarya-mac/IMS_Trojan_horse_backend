/**
 * Versioning Service
 * Manages version history and rollback for alarm patterns
 */

import { AlarmFlowRepository, type UpdateAlarmPatternInput } from '../repositories/alarm-flow.repository.js';
import type { AlarmPatternDTO, AlarmVersionDTO, VersionHistoryDTO } from '../types/dtos.js';
import type { ProgramModule } from '../types/program-modules.js';
import { NotFoundError, ValidationError, DatabaseError } from '../utils/errors.js';

/**
 * Version comparison result
 */
export interface VersionDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Versioning Service Class
 */
export class VersioningService {
  private alarmFlowRepo: AlarmFlowRepository;

  constructor() {
    this.alarmFlowRepo = new AlarmFlowRepository();
  }

  /**
   * Get the latest version of an alarm pattern
   */
  async getLatestVersion(alarmPatternKey: string): Promise<AlarmPatternDTO> {
    try {
      const pattern = await this.alarmFlowRepo.findLatestByKeyOrFail(alarmPatternKey);
      return this.alarmFlowRepo.toDTO(pattern);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to get latest version for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Get a specific version of an alarm pattern
   */
  async getSpecificVersion(alarmPatternKey: string, version: number): Promise<AlarmPatternDTO> {
    try {
      const pattern = await this.alarmFlowRepo.findSpecificVersion(alarmPatternKey, version);
      if (!pattern) {
        throw new NotFoundError('Alarm Pattern Version', `${alarmPatternKey} v${version}`);
      }
      return this.alarmFlowRepo.toDTO(pattern);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to get version ${version} for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Get full version history for an alarm pattern
   */
  async getVersionHistory(alarmPatternKey: string): Promise<VersionHistoryDTO> {
    try {
      const versions = await this.alarmFlowRepo.getVersionHistoryDTO(alarmPatternKey);

      if (versions.length === 0) {
        throw new NotFoundError('Alarm Pattern', alarmPatternKey);
      }

      const currentVersion = versions.find(v => v.isLatest)?.version || versions[0].version;

      return {
        alarmPatternKey,
        currentVersion,
        versions,
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to get version history for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Create a new version of an alarm pattern
   */
  async createNewVersion(
    alarmPatternKey: string,
    updates: {
      textExpr?: string;
      genericFamily?: string;
      genericId?: string;
      trapPdu1?: string;
      trapFlag?: number;
      suppressionPeriod?: number;
      programModules?: ProgramModule[];
    },
    userId: string,
    changeDescription: string
  ): Promise<AlarmPatternDTO> {
    try {
      if (!changeDescription || changeDescription.trim().length === 0) {
        throw new ValidationError('Change description is required');
      }

      const updateInput: UpdateAlarmPatternInput = {
        ...updates,
        changeDescription,
        updatedBy: userId,
      };

      const newVersion = await this.alarmFlowRepo.createNewVersion(alarmPatternKey, updateInput);
      return this.alarmFlowRepo.toDTO(newVersion);
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to create new version for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Rollback to a specific version
   */
  async rollbackToVersion(
    alarmPatternKey: string,
    targetVersion: number,
    userId: string,
    reason?: string
  ): Promise<AlarmPatternDTO> {
    try {
      // Validate target version exists
      const targetPattern = await this.alarmFlowRepo.findSpecificVersion(alarmPatternKey, targetVersion);
      if (!targetPattern) {
        throw new NotFoundError('Alarm Pattern Version', `${alarmPatternKey} v${targetVersion}`);
      }

      // Get current version to validate rollback makes sense
      const currentVersion = await this.alarmFlowRepo.getCurrentVersion(alarmPatternKey);
      if (targetVersion >= currentVersion) {
        throw new ValidationError(
          `Cannot rollback to version ${targetVersion}. Current version is ${currentVersion}.`
        );
      }

      const newVersion = await this.alarmFlowRepo.rollbackToVersion(
        alarmPatternKey,
        targetVersion,
        userId,
        reason
      );

      return this.alarmFlowRepo.toDTO(newVersion);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) throw error;
      throw new DatabaseError(`Failed to rollback alarm pattern ${alarmPatternKey} to version ${targetVersion}`, { error });
    }
  }

  /**
   * Compare two versions of an alarm pattern
   */
  async compareVersions(
    alarmPatternKey: string,
    version1: number,
    version2: number
  ): Promise<VersionDiff[]> {
    try {
      const [v1, v2] = await Promise.all([
        this.getSpecificVersion(alarmPatternKey, version1),
        this.getSpecificVersion(alarmPatternKey, version2),
      ]);

      const diffs: VersionDiff[] = [];
      const fieldsToCompare: (keyof AlarmPatternDTO)[] = [
        'textExpr',
        'genericFamily',
        'genericId',
        'trapPdu1',
        'trapFlag',
        'suppressionPeriod',
        'programModules',
      ];

      for (const field of fieldsToCompare) {
        const oldValue = v1[field];
        const newValue = v2[field];

        if (field === 'programModules') {
          const oldJson = JSON.stringify(oldValue);
          const newJson = JSON.stringify(newValue);
          if (oldJson !== newJson) {
            diffs.push({ field, oldValue, newValue });
          }
        } else if (oldValue !== newValue) {
          diffs.push({ field, oldValue, newValue });
        }
      }

      return diffs;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to compare versions ${version1} and ${version2} for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Get version count for an alarm pattern
   */
  async getVersionCount(alarmPatternKey: string): Promise<number> {
    try {
      const history = await this.alarmFlowRepo.findVersionHistory(alarmPatternKey);
      return history.length;
    } catch (error) {
      throw new DatabaseError(`Failed to get version count for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Check if a version exists
   */
  async versionExists(alarmPatternKey: string, version: number): Promise<boolean> {
    try {
      const pattern = await this.alarmFlowRepo.findSpecificVersion(alarmPatternKey, version);
      return pattern !== null;
    } catch (error) {
      throw new DatabaseError(`Failed to check if version ${version} exists for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Soft delete an alarm pattern (mark all versions as deleted)
   */
  async softDelete(alarmPatternKey: string, userId: string): Promise<void> {
    try {
      // Verify pattern exists
      await this.alarmFlowRepo.findLatestByKeyOrFail(alarmPatternKey);

      // Create final version marking as deleted
      await this.alarmFlowRepo.createNewVersion(alarmPatternKey, {
        changeDescription: `Deleted by ${userId}`,
        updatedBy: userId,
      });

      // Then soft delete
      await this.alarmFlowRepo.softDelete(alarmPatternKey);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to soft delete alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Generate automatic change description from diff
   */
  generateChangeDescription(oldPattern: AlarmPatternDTO, newPattern: Partial<AlarmPatternDTO>): string {
    const changes: string[] = [];

    if (newPattern.textExpr && newPattern.textExpr !== oldPattern.textExpr) {
      changes.push('Updated text expression');
    }
    if (newPattern.genericFamily && newPattern.genericFamily !== oldPattern.genericFamily) {
      changes.push('Updated generic family');
    }
    if (newPattern.genericId && newPattern.genericId !== oldPattern.genericId) {
      changes.push('Updated generic ID');
    }
    if (newPattern.trapPdu1 && newPattern.trapPdu1 !== oldPattern.trapPdu1) {
      changes.push('Updated trap PDU');
    }
    if (newPattern.trapFlag !== undefined && newPattern.trapFlag !== oldPattern.trapFlag) {
      changes.push('Updated trap flag');
    }
    if (newPattern.suppressionPeriod !== undefined && newPattern.suppressionPeriod !== oldPattern.suppressionPeriod) {
      changes.push('Updated suppression period');
    }
    if (newPattern.programModules) {
      const oldModulesJson = JSON.stringify(oldPattern.programModules);
      const newModulesJson = JSON.stringify(newPattern.programModules);
      if (oldModulesJson !== newModulesJson) {
        const oldCount = oldPattern.programModules?.length || 0;
        const newCount = newPattern.programModules.length;
        if (newCount > oldCount) {
          changes.push(`Added ${newCount - oldCount} program module(s)`);
        } else if (newCount < oldCount) {
          changes.push(`Removed ${oldCount - newCount} program module(s)`);
        } else {
          changes.push('Modified program modules');
        }
      }
    }

    return changes.length > 0 ? changes.join('; ') : 'No changes detected';
  }
}

export default VersioningService;
