/**
 * Validation Schemas using Zod
 * Production-grade input validation for API requests
 */

import { z } from 'zod';

/**
 * Program module schema
 */
export const ProgramModuleSchema = z.object({
  type: z.number().int().min(0).max(39),
  x: z.number(),
  y: z.number(),
  name: z.string().min(1),
  inputs: z.array(z.string()).optional(),
  classes: z.array(z.string()).optional(),
  parameters: z.array(z.string()).optional(),
});

export type ValidatedProgramModule = z.infer<typeof ProgramModuleSchema>;

/**
 * Create alarm pattern request schema
 */
export const CreateAlarmPatternSchema = z.object({
  no: z.number().int().positive(),
  alarmId: z.string().min(1).max(128),
  textExpr: z.string().min(1).max(512),
  genericFamily: z.string().min(1).max(64),
  genericId: z.string().min(1).max(128),
  trapPdu1: z.string().max(128),
  trapFlag: z.number().int().min(0).max(1),
  suppressionPeriod: z.number().min(0),
  programModules: z.array(ProgramModuleSchema).optional(),
  createdBy: z.string().max(36).optional(),
});

export type ValidatedCreateAlarmPattern = z.infer<typeof CreateAlarmPatternSchema>;

/**
 * Update alarm pattern request schema
 */
export const UpdateAlarmPatternSchema = z.object({
  textExpr: z.string().min(1).max(512).optional(),
  genericFamily: z.string().min(1).max(64).optional(),
  genericId: z.string().min(1).max(128).optional(),
  trapPdu1: z.string().max(128).optional(),
  trapFlag: z.number().int().min(0).max(1).optional(),
  suppressionPeriod: z.number().min(0).optional(),
  programModules: z.array(ProgramModuleSchema).optional(),
  changeDescription: z.string().min(1).max(512),
  updatedBy: z.string().min(1).max(36),
});

export type ValidatedUpdateAlarmPattern = z.infer<typeof UpdateAlarmPatternSchema>;

/**
 * Rollback request schema
 */
export const RollbackAlarmPatternSchema = z.object({
  targetVersion: z.number().int().positive(),
  rollbackBy: z.string().min(1).max(36),
  reason: z.string().max(512).optional(),
});

export type ValidatedRollbackAlarmPattern = z.infer<typeof RollbackAlarmPatternSchema>;

/**
 * Update class request schema
 */
export const UpdateClassSchema = z.object({
  description: z.string().max(256).optional(),
  defaultFlag: z.number().int().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  patterns: z.array(z.object({
    pattern: z.string(),
    flags: z.number().int(),
  })).optional(),
});

export type ValidatedUpdateClass = z.infer<typeof UpdateClassSchema>;

/**
 * Pagination params schema
 */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export type ValidatedPagination = z.infer<typeof PaginationSchema>;

/**
 * Import config request schema
 */
export const ImportConfigSchema = z.object({
  jsonContent: z.string().min(1),
  overwriteExisting: z.boolean().default(false),
});

export type ValidatedImportConfig = z.infer<typeof ImportConfigSchema>;

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: z.ZodError;
}

/**
 * Validate data against a schema
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error };
}

/**
 * Format Zod errors for API response
 */
export function formatValidationErrors(errors: z.ZodError): string[] {
  return errors.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
