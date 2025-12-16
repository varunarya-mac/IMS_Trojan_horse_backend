/**
 * Refrigeration Constants
 * Keywords, columns, and thresholds for refrigeration data validation and analysis
 */

/**
 * Keywords that indicate refrigeration-related questions
 * Used in Layer 1 guardrails
 */
export const REFRIGERATION_KEYWORDS = [
  // Equipment
  'refrigerator', 'refrigeration', 'freezer', 'cooler', 'chiller',
  'pack', 'case', 'rack', 'cabinet', 'display case',

  // Components
  'compressor', 'condenser', 'evaporator', 'expansion valve',
  'suction', 'discharge', 'receiver', 'accumulator',
  'defrost', 'coil', 'fan', 'motor',

  // Measurements
  'temperature', 'temp', 'pressure', 'superheat', 'subcooling',
  'air on', 'air off', 'shelf temp', 'product temp',

  // States/Conditions
  'alarm', 'alert', 'fault', 'warning', 'critical',
  'icing', 'ice', 'frost', 'warm', 'cold', 'hot',
  'drift', 'spike', 'flatline', 'recovery',

  // Operations
  'defrost cycle', 'pull-down', 'night mode', 'day mode',
  'setpoint', 'cut-in', 'cut-out', 'floating pressure',

  // Industry
  'cold chain', 'food safety', 'haccp', 'retail refrigeration',
  'supermarket', 'grocery', 'store', 'hvac', 'hvacr',

  // Technical terms from reference document
  'armax', 'residual', 'baseline', 'envelope', 'signaling'
] as const;

/**
 * Patterns that indicate non-refrigeration questions
 */
export const BLOCKED_PATTERNS = [
  // Cooking/recipes
  /\b(recipe|cook(?:ing)?|bake|roast|fry|ingredient)\b/i,

  // Weather
  /\b(weather|forecast|rain|snow|climate)\b/i,

  // Finance
  /\b(stock|crypto|invest|bitcoin|trading|portfolio)\b/i,

  // Entertainment
  /\b(movie|game|music|song|artist|actor)\b/i,

  // Personal advice
  /\b(relationship|dating|love|marriage)\b/i,
] as const;

/**
 * Generic patterns that should be allowed (data operations)
 */
export const ALLOWED_GENERIC_PATTERNS = [
  /^(summarize|analyze|explain|show|what|why|how)/i,
  /\b(file|csv|data|upload|chart|graph)\b/i,
] as const;

/**
 * Required columns for valid refrigeration CSV
 */
export const REQUIRED_COLUMNS = {
  case: {
    required: [
      'timestamp',
      'state_case',
    ],
    atLeastOne: [
      ['air_on_temperature', 'air_off_temperature', 'shelf_temperature'],
      ['case_id', 'case_name', 'device_case'],
    ]
  },
  pack: {
    required: [
      'timestamp',
      'state_pack',
    ],
    atLeastOne: [
      ['suction_temperature', 'suction_pressure'],
      ['pack_id', 'pack_name', 'device_pack'],
    ]
  }
} as const;

/**
 * All known refrigeration-related column names
 */
export const REFRIGERATION_COLUMNS = [
  // Identifiers
  'timestamp', 'store_number', 'store_name', 'case_id', 'pack_id',
  'case_name', 'pack_name', 'case_class', 'pack_class',
  'device_case', 'device_pack', 'ip_case', 'ip_pack',

  // Case temperatures
  'air_on_temperature', 'air_off_temperature', 'shelf_temperature',
  'calculated_product_temperature', 'defrost_temperature',
  'evaporator_in_temperature', 'evaporator_out_temperature',

  // Case states
  'state_case', 'severity_case', 'defrost_state', 'clean_state',
  'door_state', 'light_state', 'night_state', 'fan_state',

  // Case metrics
  'evaporator_valve_percentage', 'evaporator_tempdiff',
  'control_setpoint_temperature', 'superheat_setpoint_temperature',

  // Case alarms
  'air_on_low', 'air_on_high', 'air_off_low', 'air_off_high',
  'shelf_low', 'shelf_high', 'neg_air_flow',
  'case_comms_fault', 'cm_too_cold', 'cm_too_warm',
  'cm_air_flow', 'cm_poor_defrost', 'cm_valve_cycle', 'cm_superheat',

  // Pack data
  'state_pack', 'severity_pack',
  'suction_temperature', 'suction_pressure', 'suction_floating_setpoint_pressure',
  'discharge_pressure', 'discharge_setpoint_pressure',

  // Compressor data
  'compressor_1_percentage', 'compressor_2_percentage',
  'compressor_3_percentage', 'compressor_4_percentage',
  'compressor_5_percentage', 'compressor_6_percentage',
  'compressor_7_percentage', 'compressor_8_percentage',
  'compressor_percentage',
  'compressor_1_fault', 'compressor_2_fault',
  'compressor_3_fault', 'compressor_4_fault',

  // Condenser data
  'condenser_fan_percentage', 'condenser_air_on_temperature',
  'condenser_tempdiff', 'liquid_level_percentage',
  'condenser_fan_1_state', 'condenser_fan_2_state',

  // Evaporator averages
  'evaporator_in_average_temperature', 'evaporator_out_average_temperature',

  // Time periods
  'next_defrost_period', 'defrost_period',
  'defrost_pulldown_period', 'defrost_cycle_period',
  '_duration_case', '_duration_pack',
  'from_case', 'to_case', 'from_pack', 'to_pack',
  'firstoccurrence', 'ipaddress'
] as const;

/**
 * Temperature column mappings for graph generation
 */
export const TEMPERATURE_COLUMNS = {
  case: [
    { key: 'air_on_temperature', label: 'Air On Temp', color: '#f4a261' },
    { key: 'air_off_temperature', label: 'Air Off Temp', color: '#2a9d8f' },
    { key: 'shelf_temperature', label: 'Shelf Temp', color: '#e76f51' },
    { key: 'calculated_product_temperature', label: 'Product Temp', color: '#264653' },
    { key: 'defrost_temperature', label: 'Defrost Temp', color: '#e9c46a' },
  ],
  pack: [
    { key: 'suction_temperature', label: 'Suction Temp', color: '#457b9d' },
    { key: 'condenser_air_on_temperature', label: 'Condenser Air On', color: '#e63946' },
  ]
} as const;

/**
 * Signal detection thresholds from reference document
 */
export const SIGNAL_THRESHOLDS = {
  residualDrift: {
    warning: 1.5,  // degrees/24h
    major: 2.0,    // degrees/24h
    critical: 0.2  // degrees/h
  },
  recoveryTime: {
    warning: 5,    // minutes above spec
    major: 15,     // minutes above spec
    critical: 20   // minutes above spec
  },
  defrostApex: {
    zScoreWarning: 2,
    caseLimitFrozen: 0,      // degrees C
    caseLimitChilled: 8      // degrees C
  },
  variance: {
    warning: 1.5,  // sigma ratio
    major: 2.0,
    critical: 3.0
  }
} as const;

/**
 * Maximum file size for CSV uploads (50MB)
 */
export const MAX_CSV_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Threshold for using sampling strategy (10MB)
 */
export const SAMPLING_THRESHOLD_SIZE = 10 * 1024 * 1024;

/**
 * Default sample size for large files
 */
export const DEFAULT_SAMPLE_SIZE = 5000;

/**
 * Maximum data points for graphs
 */
export const MAX_GRAPH_DATA_POINTS = 500;
