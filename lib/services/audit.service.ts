/**
 * Audit Service
 * Provides audit trail and change tracking functionality
 */

import { AlarmFlowRepository } from '../repositories/alarm-flow.repository.js';
import type { AlarmPatternDTO } from '../types/dtos.js';
import type { ProgramModule } from '../types/program-modules.js';
import { DatabaseError } from '../utils/errors.js';

/**
 * Audit action types
 */
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ROLLBACK'
  | 'IMPORT'
  | 'EXPORT'
  | 'VIEW';

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  alarmPatternKey: string;
  version: number;
  action: AuditAction;
  userId: string | null;
  description: string;
  changes: FieldChange[];
  timestamp: string;
}

/**
 * Field change record
 */
export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Audit trail result
 */
export interface AuditTrail {
  alarmPatternKey: string;
  totalVersions: number;
  entries: AuditLogEntry[];
}

/**
 * Audit Service Class
 */
export class AuditService {
  private alarmFlowRepo: AlarmFlowRepository;

  constructor() {
    this.alarmFlowRepo = new AlarmFlowRepository();
  }

  /**
   * Get audit trail for an alarm pattern
   * Uses version history as the audit log
   */
  async getAuditTrail(alarmPatternKey: string): Promise<AuditTrail> {
    try {
      const versions = await this.alarmFlowRepo.getVersionHistoryDTO(alarmPatternKey);

      if (versions.length === 0) {
        return {
          alarmPatternKey,
          totalVersions: 0,
          entries: [],
        };
      }

      // Convert versions to audit entries
      const entries: AuditLogEntry[] = [];

      for (let i = 0; i < versions.length; i++) {
        const version = versions[i];
        const previousVersion = versions[i + 1]; // versions are sorted desc

        const action = this.determineAction(version.changeDescription);
        const changes = previousVersion
          ? this.computeChanges(previousVersion.alarm, version.alarm)
          : [];

        entries.push({
          id: version.alarm.id,
          alarmPatternKey,
          version: version.version,
          action,
          userId: version.createdBy,
          description: version.changeDescription || 'No description',
          changes,
          timestamp: version.createdAt,
        });
      }

      return {
        alarmPatternKey,
        totalVersions: versions.length,
        entries,
      };
    } catch (error) {
      throw new DatabaseError(`Failed to get audit trail for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Log a change action
   * Creates a new version with audit information
   */
  async logChange(
    alarmPatternKey: string,
    userId: string,
    action: AuditAction,
    description: string,
    updates?: Partial<{
      textExpr: string;
      genericFamily: string;
      genericId: string;
      trapPdu1: string;
      trapFlag: number;
      suppressionPeriod: number;
      programModules: ProgramModule[];
    }>
  ): Promise<AlarmPatternDTO> {
    try {
      const fullDescription = `[${action}] ${description}`;

      const newVersion = await this.alarmFlowRepo.createNewVersion(alarmPatternKey, {
        ...updates,
        changeDescription: fullDescription,
        updatedBy: userId,
      });

      return this.alarmFlowRepo.toDTO(newVersion);
    } catch (error) {
      throw new DatabaseError(`Failed to log change for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Generate automatic change description from comparing two patterns
   */
  generateChangeDescription(
    oldPattern: AlarmPatternDTO,
    newPattern: Partial<AlarmPatternDTO>
  ): string {
    const changes: string[] = [];

    if (newPattern.textExpr !== undefined && newPattern.textExpr !== oldPattern.textExpr) {
      changes.push('text expression');
    }
    if (newPattern.genericFamily !== undefined && newPattern.genericFamily !== oldPattern.genericFamily) {
      changes.push('generic family');
    }
    if (newPattern.genericId !== undefined && newPattern.genericId !== oldPattern.genericId) {
      changes.push('generic ID');
    }
    if (newPattern.trapPdu1 !== undefined && newPattern.trapPdu1 !== oldPattern.trapPdu1) {
      changes.push('trap PDU');
    }
    if (newPattern.trapFlag !== undefined && newPattern.trapFlag !== oldPattern.trapFlag) {
      changes.push('trap flag');
    }
    if (newPattern.suppressionPeriod !== undefined && newPattern.suppressionPeriod !== oldPattern.suppressionPeriod) {
      changes.push('suppression period');
    }
    if (newPattern.programModules !== undefined) {
      const oldModulesJson = JSON.stringify(oldPattern.programModules || []);
      const newModulesJson = JSON.stringify(newPattern.programModules || []);
      if (oldModulesJson !== newModulesJson) {
        changes.push('program modules');
      }
    }

    if (changes.length === 0) {
      return 'No changes detected';
    }

    if (changes.length === 1) {
      return `Updated ${changes[0]}`;
    }

    const lastChange = changes.pop();
    return `Updated ${changes.join(', ')} and ${lastChange}`;
  }

  /**
   * Get changes between two alarm pattern versions
   */
  async getChangesBetweenVersions(
    alarmPatternKey: string,
    fromVersion: number,
    toVersion: number
  ): Promise<FieldChange[]> {
    try {
      const [from, to] = await Promise.all([
        this.alarmFlowRepo.findSpecificVersion(alarmPatternKey, fromVersion),
        this.alarmFlowRepo.findSpecificVersion(alarmPatternKey, toVersion),
      ]);

      if (!from || !to) {
        return [];
      }

      return this.computeChanges(
        this.alarmFlowRepo.toDTO(from),
        this.alarmFlowRepo.toDTO(to)
      );
    } catch (error) {
      throw new DatabaseError(`Failed to get changes between versions ${fromVersion} and ${toVersion} for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Get summary of all changes for an alarm pattern
   */
  async getChangeSummary(alarmPatternKey: string): Promise<{
    totalChanges: number;
    changesByUser: Record<string, number>;
    changesByAction: Record<AuditAction, number>;
    firstChange: string;
    lastChange: string;
  }> {
    try {
      const trail = await this.getAuditTrail(alarmPatternKey);

      const changesByUser: Record<string, number> = {};
      const changesByAction: Record<AuditAction, number> = {
        CREATE: 0,
        UPDATE: 0,
        DELETE: 0,
        ROLLBACK: 0,
        IMPORT: 0,
        EXPORT: 0,
        VIEW: 0,
      };

      for (const entry of trail.entries) {
        const user = entry.userId || 'system';
        changesByUser[user] = (changesByUser[user] || 0) + 1;
        changesByAction[entry.action]++;
      }

      const timestamps = trail.entries.map(e => e.timestamp).sort();

      return {
        totalChanges: trail.totalVersions,
        changesByUser,
        changesByAction,
        firstChange: timestamps[0] || '',
        lastChange: timestamps[timestamps.length - 1] || '',
      };
    } catch (error) {
      throw new DatabaseError(`Failed to get change summary for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Search audit entries by user
   */
  async getAuditsByUser(userId: string, limit: number = 100): Promise<AuditLogEntry[]> {
    try {
      // This would require a different query approach
      // For now, we return an empty array as this needs additional indexing
      // In production, you'd want a dedicated audit_logs collection
      return [];
    } catch (error) {
      throw new DatabaseError(`Failed to get audits by user: ${userId}`, { error });
    }
  }

  /**
   * Search audit entries by date range
   */
  async getAuditsByDateRange(
    alarmPatternKey: string,
    startDate: string,
    endDate: string
  ): Promise<AuditLogEntry[]> {
    try {
      const trail = await this.getAuditTrail(alarmPatternKey);

      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();

      return trail.entries.filter(entry => {
        const entryTime = new Date(entry.timestamp).getTime();
        return entryTime >= start && entryTime <= end;
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get audits by date range for alarm pattern: ${alarmPatternKey}`, { error });
    }
  }

  /**
   * Compute field changes between two alarm patterns
   */
  private computeChanges(
    oldPattern: AlarmPatternDTO,
    newPattern: AlarmPatternDTO
  ): FieldChange[] {
    const changes: FieldChange[] = [];
    const fieldsToCompare: (keyof AlarmPatternDTO)[] = [
      'textExpr',
      'genericFamily',
      'genericId',
      'trapPdu1',
      'trapFlag',
      'suppressionPeriod',
    ];

    for (const field of fieldsToCompare) {
      const oldValue = oldPattern[field];
      const newValue = newPattern[field];

      if (oldValue !== newValue) {
        changes.push({ field, oldValue, newValue });
      }
    }

    // Compare program modules
    const oldModulesJson = JSON.stringify(oldPattern.programModules || []);
    const newModulesJson = JSON.stringify(newPattern.programModules || []);

    if (oldModulesJson !== newModulesJson) {
      changes.push({
        field: 'programModules',
        oldValue: oldPattern.programModules,
        newValue: newPattern.programModules,
      });
    }

    return changes;
  }

  /**
   * Determine action type from change description
   */
  private determineAction(description: string | null): AuditAction {
    if (!description) return 'UPDATE';

    const lowerDesc = description.toLowerCase();

    if (lowerDesc.includes('[create]') || lowerDesc.includes('initial version')) {
      return 'CREATE';
    }
    if (lowerDesc.includes('[delete]') || lowerDesc.includes('deleted')) {
      return 'DELETE';
    }
    if (lowerDesc.includes('[rollback]') || lowerDesc.includes('rollback to')) {
      return 'ROLLBACK';
    }
    if (lowerDesc.includes('[import]') || lowerDesc.includes('via import')) {
      return 'IMPORT';
    }
    if (lowerDesc.includes('[export]')) {
      return 'EXPORT';
    }

    return 'UPDATE';
  }
}

export default AuditService;
