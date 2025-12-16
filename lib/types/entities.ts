/**
 * Database Entity Types
 * These interfaces represent the documents stored in Appwrite collections
 */

import type { Models } from 'node-appwrite';

/**
 * Base entity with Appwrite document fields
 */
export interface BaseEntity extends Models.Document {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
}

/**
 * Discipline entity - represents a device category (refrigeration, hvac, etc.)
 */
export interface DisciplineEntity extends BaseEntity {
  name: string;
  enterpriseName: string;
  enterpriseVersion: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Discipline Type entity - represents a subcategory (pack, case, zone, etc.)
 */
export interface DisciplineTypeEntity extends BaseEntity {
  disciplineId: string;
  name: string;
  createdAt: string;
}

/**
 * Alarm Pattern entity - versioned alarm configuration
 */
export interface AlarmPatternEntity extends BaseEntity {
  disciplineTypeId: string;
  alarmPatternKey: string;
  version: number;
  isLatest: boolean;
  no: number;
  alarmId: string;
  textExpr: string;
  genericFamily: string;
  genericId: string;
  trapPdu1: string;
  trapFlag: number;
  suppressionPeriod: number;
  programModules: string | null; // JSON stringified
  createdAt: string;
  createdBy: string | null;
  changeDescription: string | null;
}

/**
 * Class entity - threshold configurations for alarms
 */
export interface ClassEntity extends BaseEntity {
  disciplineTypeId: string;
  classId: string;
  description: string;
  defaultFlag: number;
  data: string | null; // JSON stringified
  patterns: string | null; // JSON stringified
  createdAt: string;
}

/**
 * Field entity - field definitions for discipline types
 */
export interface FieldEntity extends BaseEntity {
  disciplineTypeId: string;
  name: string;
  arrayType: string | null;
  arraySize: number | null;
  fieldType1: string | null;
  fieldType2: string | null;
  createdAt: string;
}

/**
 * Collection IDs for Appwrite
 */
export const COLLECTION_IDS = {
  // Alarm Management collections
  DISCIPLINES: 'disciplines',
  DISCIPLINE_TYPES: 'discipline_types',
  ALARM_PATTERNS: 'alarm_patterns',
  CLASSES: 'classes',
  FIELDS: 'fields',

  // IoT Refrigeration Chat collections
  CHATS: 'chats',
  MESSAGES: 'messages',
  PROCESSING_JOBS: 'processing_jobs',
} as const;

export type CollectionId = typeof COLLECTION_IDS[keyof typeof COLLECTION_IDS];
