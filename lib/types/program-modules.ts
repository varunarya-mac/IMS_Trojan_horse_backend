/**
 * Program Module Types
 * Defines the 40 different module types used in alarm flow visual programming
 */

/**
 * Program module type enum (0-39)
 * Maps to visual node types in the flow editor
 */
export enum ProgramModuleType {
  LABEL = 0,        // Input/Output node
  OVER = 1,         // > (Over threshold)
  UNDER = 2,        // < (Under threshold)
  AVG = 3,          // Average over time
  // Types 4-6 reserved
  MIN = 7,          // Minimum of inputs
  MAX = 8,          // Maximum of inputs
  // Types 9-11 reserved
  SUBTRACT = 12,    // Subtraction
  // Types 13-14 reserved
  CMP = 15,         // Compare with false/true values
  CHG = 16,         // Change detection
  IFNUL = 17,       // If null fallback
  SEV = 18,         // Severity output (0-6)
  TD = 19,          // Time difference
  // Types 20-25 reserved
  COUNT = 26,       // Count threshold events
  // Types 27-39 reserved
}

/**
 * Program module type symbols for display
 */
export const PROGRAM_MODULE_SYMBOLS: Record<number, string> = {
  0: '(label)',
  1: '>',
  2: '<',
  3: 'AVG',
  7: 'MIN',
  8: 'MAX',
  12: '-',
  15: 'CMP',
  16: 'CHG',
  17: 'IFNUL',
  18: 'SEV',
  19: 'TD',
  26: 'COUNT',
};

/**
 * Base program module interface
 */
export interface ProgramModule {
  type: number;
  x: number;
  y: number;
  name: string;
  inputs?: string[];
  classes?: string[];
  parameters?: string[];
}

/**
 * Label module (type 0) - Input/Output nodes
 */
export interface LabelModule extends ProgramModule {
  type: 0;
  name: string; // $variable_name or %output_name
}

/**
 * Comparison module (type 1 or 2) - Over/Under threshold
 */
export interface ComparisonModule extends ProgramModule {
  type: 1 | 2;
  inputs: string[];
  classes: string[]; // Reference to class thresholds
}

/**
 * Average module (type 3) - Time-based average
 */
export interface AverageModule extends ProgramModule {
  type: 3;
  inputs: string[];
  parameters: string[]; // [time_period_seconds]
}

/**
 * Min/Max module (type 7 or 8)
 */
export interface MinMaxModule extends ProgramModule {
  type: 7 | 8;
  inputs: string[];
}

/**
 * Subtract module (type 12)
 */
export interface SubtractModule extends ProgramModule {
  type: 12;
  inputs: string[]; // [minuend, subtrahend]
}

/**
 * Compare module (type 15)
 */
export interface CompareModule extends ProgramModule {
  type: 15;
  inputs: string[];
  parameters: string[]; // [false_value, true_value]
}

/**
 * Change detection module (type 16)
 */
export interface ChangeModule extends ProgramModule {
  type: 16;
  inputs: string[];
  parameters: string[]; // [threshold]
}

/**
 * If null module (type 17)
 */
export interface IfNullModule extends ProgramModule {
  type: 17;
  inputs: string[]; // [value, fallback]
}

/**
 * Severity module (type 18) - Outputs severity 0-6
 */
export interface SeverityModule extends ProgramModule {
  type: 18;
  inputs: string[];
}

/**
 * Time difference module (type 19)
 */
export interface TimeDifferenceModule extends ProgramModule {
  type: 19;
  inputs: string[]; // [time1, time2]
}

/**
 * Count module (type 26) - Count threshold events
 */
export interface CountModule extends ProgramModule {
  type: 26;
  inputs: string[];
  parameters: string[]; // [count_threshold, time_window]
}

/**
 * Type guard to check if module is a label
 */
export function isLabelModule(module: ProgramModule): module is LabelModule {
  return module.type === ProgramModuleType.LABEL;
}

/**
 * Type guard to check if module is a comparison
 */
export function isComparisonModule(module: ProgramModule): module is ComparisonModule {
  return module.type === ProgramModuleType.OVER || module.type === ProgramModuleType.UNDER;
}

/**
 * Type guard to check if module is a severity output
 */
export function isSeverityModule(module: ProgramModule): module is SeverityModule {
  return module.type === ProgramModuleType.SEV;
}

/**
 * Validate program module structure
 */
export function validateProgramModule(module: unknown): module is ProgramModule {
  if (typeof module !== 'object' || module === null) return false;

  const m = module as Record<string, unknown>;

  return (
    typeof m.type === 'number' &&
    typeof m.x === 'number' &&
    typeof m.y === 'number' &&
    typeof m.name === 'string'
  );
}

/**
 * Parse program modules from JSON string
 */
export function parseProgramModules(json: string | null): ProgramModule[] {
  if (!json) return [];

  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(validateProgramModule);
  } catch {
    return [];
  }
}

/**
 * Stringify program modules for storage
 */
export function stringifyProgramModules(modules: ProgramModule[]): string {
  return JSON.stringify(modules);
}
