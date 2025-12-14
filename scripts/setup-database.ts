#!/usr/bin/env npx tsx
/**
 * Setup Database Script
 * Creates Appwrite database, collections, attributes, and indexes
 *
 * Usage: npx tsx scripts/setup-database.ts
 *
 * Environment variables required:
 * - APPWRITE_ENDPOINT: Appwrite API endpoint
 * - APPWRITE_PROJECT_ID: Appwrite project ID
 * - APPWRITE_API_KEY: Appwrite API key with databases.write permission
 * - APPWRITE_DATABASE_ID: (optional) Database ID to use
 */

import { Client, Databases, ID, IndexType } from 'node-appwrite';
import { config } from 'dotenv';

// Load environment variables
config();

// Configuration
const ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'iot_alarm_management';

// Collection IDs
const COLLECTION_IDS = {
  DISCIPLINES: 'disciplines',
  DISCIPLINE_TYPES: 'discipline_types',
  ALARM_PATTERNS: 'alarm_patterns',
  CLASSES: 'classes',
  FIELDS: 'fields',
};

// Validate environment
function validateEnvironment(): void {
  if (!PROJECT_ID) {
    throw new Error('APPWRITE_PROJECT_ID environment variable is required');
  }
  if (!API_KEY) {
    throw new Error('APPWRITE_API_KEY environment variable is required');
  }
}

// Initialize Appwrite client
function initClient(): Databases {
  const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID!)
    .setKey(API_KEY!);

  return new Databases(client);
}

// Wait for attribute to be available
async function waitForAttribute(
  databases: Databases,
  collectionId: string,
  attributeKey: string,
  maxAttempts: number = 30
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const attr = await databases.getAttribute(DATABASE_ID, collectionId, attributeKey) as { status: string };
      if (attr.status === 'available') {
        return;
      }
    } catch {
      // Attribute not found yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Attribute ${attributeKey} did not become available in time`);
}

// Create database
async function createDatabase(databases: Databases): Promise<void> {
  console.log('Creating database...');
  try {
    await databases.create(DATABASE_ID, 'IoT Alarm Management', true);
    console.log(`  ✓ Created database: ${DATABASE_ID}`);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log(`  ⊖ Database already exists: ${DATABASE_ID}`);
    } else {
      throw error;
    }
  }
}

// Create disciplines collection
async function createDisciplinesCollection(databases: Databases): Promise<void> {
  const collectionId = COLLECTION_IDS.DISCIPLINES;
  console.log(`\nCreating ${collectionId} collection...`);

  try {
    await databases.createCollection(DATABASE_ID, collectionId, 'Disciplines', [], true);
    console.log(`  ✓ Created collection: ${collectionId}`);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log(`  ⊖ Collection already exists: ${collectionId}`);
    } else {
      throw error;
    }
  }

  // Create attributes
  const attributes = [
    { key: 'name', size: 128, required: true },
    { key: 'enterpriseName', size: 256, required: true },
    { key: 'enterpriseVersion', size: 64, required: true },
    { key: 'createdAt', size: 64, required: true },
    { key: 'updatedAt', size: 64, required: false },
  ];

  for (const attr of attributes) {
    try {
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        attr.key,
        attr.size,
        attr.required
      );
      console.log(`  ✓ Created attribute: ${attr.key}`);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(`  ⊖ Attribute already exists: ${attr.key}`);
      } else {
        throw error;
      }
    }
  }

  // Wait for attributes
  for (const attr of attributes) {
    await waitForAttribute(databases, collectionId, attr.key);
  }

  // Create indexes
  try {
    await databases.createIndex(
      DATABASE_ID,
      collectionId,
      'idx_name',
      IndexType.Unique,
      ['name']
    );
    console.log('  ✓ Created index: idx_name');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log('  ⊖ Index already exists: idx_name');
    } else {
      throw error;
    }
  }

  try {
    await databases.createIndex(
      DATABASE_ID,
      collectionId,
      'idx_enterprise_name',
      IndexType.Key,
      ['enterpriseName']
    );
    console.log('  ✓ Created index: idx_enterprise_name');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log('  ⊖ Index already exists: idx_enterprise_name');
    } else {
      throw error;
    }
  }
}

// Create discipline_types collection
async function createDisciplineTypesCollection(databases: Databases): Promise<void> {
  const collectionId = COLLECTION_IDS.DISCIPLINE_TYPES;
  console.log(`\nCreating ${collectionId} collection...`);

  try {
    await databases.createCollection(DATABASE_ID, collectionId, 'Discipline Types', [], true);
    console.log(`  ✓ Created collection: ${collectionId}`);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log(`  ⊖ Collection already exists: ${collectionId}`);
    } else {
      throw error;
    }
  }

  // Create attributes
  const stringAttrs = [
    { key: 'disciplineId', size: 36, required: true },
    { key: 'name', size: 128, required: true },
    { key: 'createdAt', size: 64, required: true },
  ];

  for (const attr of stringAttrs) {
    try {
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        attr.key,
        attr.size,
        attr.required
      );
      console.log(`  ✓ Created attribute: ${attr.key}`);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(`  ⊖ Attribute already exists: ${attr.key}`);
      } else {
        throw error;
      }
    }
  }

  // Wait for attributes
  for (const attr of stringAttrs) {
    await waitForAttribute(databases, collectionId, attr.key);
  }

  // Create indexes
  try {
    await databases.createIndex(
      DATABASE_ID,
      collectionId,
      'idx_discipline_name',
      IndexType.Unique,
      ['disciplineId', 'name']
    );
    console.log('  ✓ Created index: idx_discipline_name');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log('  ⊖ Index already exists: idx_discipline_name');
    } else {
      throw error;
    }
  }

  try {
    await databases.createIndex(
      DATABASE_ID,
      collectionId,
      'idx_name',
      IndexType.Key,
      ['name']
    );
    console.log('  ✓ Created index: idx_name');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log('  ⊖ Index already exists: idx_name');
    } else {
      throw error;
    }
  }
}

// Create alarm_patterns collection
async function createAlarmPatternsCollection(databases: Databases): Promise<void> {
  const collectionId = COLLECTION_IDS.ALARM_PATTERNS;
  console.log(`\nCreating ${collectionId} collection...`);

  try {
    await databases.createCollection(DATABASE_ID, collectionId, 'Alarm Patterns', [], true);
    console.log(`  ✓ Created collection: ${collectionId}`);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log(`  ⊖ Collection already exists: ${collectionId}`);
    } else {
      throw error;
    }
  }

  // Create string attributes
  const stringAttrs = [
    { key: 'disciplineTypeId', size: 36, required: true },
    { key: 'alarmPatternKey', size: 128, required: true },
    { key: 'alarmId', size: 64, required: true },
    { key: 'textExpr', size: 1024, required: true },
    { key: 'genericFamily', size: 64, required: true },
    { key: 'genericId', size: 64, required: true },
    { key: 'trapPdu1', size: 256, required: true },
    { key: 'programModules', size: 1048576, required: false }, // 1MB for JSON
    { key: 'createdAt', size: 64, required: true },
    { key: 'createdBy', size: 128, required: false },
    { key: 'changeDescription', size: 512, required: false },
  ];

  for (const attr of stringAttrs) {
    try {
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        attr.key,
        attr.size,
        attr.required
      );
      console.log(`  ✓ Created attribute: ${attr.key}`);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(`  ⊖ Attribute already exists: ${attr.key}`);
      } else {
        throw error;
      }
    }
  }

  // Create integer attributes
  const intAttrs = [
    { key: 'version', required: true, min: 1, max: 999999 },
    { key: 'no', required: true, min: 0, max: 999999 },
    { key: 'trapFlag', required: true, min: 0, max: 999 },
    { key: 'suppressionPeriod', required: true, min: 0, max: 999999 },
  ];

  for (const attr of intAttrs) {
    try {
      await databases.createIntegerAttribute(
        DATABASE_ID,
        collectionId,
        attr.key,
        attr.required,
        attr.min,
        attr.max
      );
      console.log(`  ✓ Created attribute: ${attr.key}`);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(`  ⊖ Attribute already exists: ${attr.key}`);
      } else {
        throw error;
      }
    }
  }

  // Create boolean attribute
  try {
    await databases.createBooleanAttribute(
      DATABASE_ID,
      collectionId,
      'isLatest',
      true
    );
    console.log('  ✓ Created attribute: isLatest');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log('  ⊖ Attribute already exists: isLatest');
    } else {
      throw error;
    }
  }

  // Wait for all attributes
  const allAttrKeys = [...stringAttrs.map(a => a.key), ...intAttrs.map(a => a.key), 'isLatest'];
  for (const key of allAttrKeys) {
    await waitForAttribute(databases, collectionId, key);
  }

  // Create indexes
  const indexes = [
    { key: 'idx_type_latest', type: IndexType.Key, attrs: ['disciplineTypeId', 'isLatest'] },
    { key: 'idx_key_latest', type: IndexType.Key, attrs: ['alarmPatternKey', 'isLatest'] },
    { key: 'idx_key', type: IndexType.Key, attrs: ['alarmPatternKey'] },
    { key: 'idx_created_by', type: IndexType.Key, attrs: ['createdBy'] },
  ];

  for (const idx of indexes) {
    try {
      await databases.createIndex(
        DATABASE_ID,
        collectionId,
        idx.key,
        idx.type,
        idx.attrs
      );
      console.log(`  ✓ Created index: ${idx.key}`);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(`  ⊖ Index already exists: ${idx.key}`);
      } else {
        throw error;
      }
    }
  }
}

// Create classes collection
async function createClassesCollection(databases: Databases): Promise<void> {
  const collectionId = COLLECTION_IDS.CLASSES;
  console.log(`\nCreating ${collectionId} collection...`);

  try {
    await databases.createCollection(DATABASE_ID, collectionId, 'Classes', [], true);
    console.log(`  ✓ Created collection: ${collectionId}`);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log(`  ⊖ Collection already exists: ${collectionId}`);
    } else {
      throw error;
    }
  }

  // Create string attributes
  const stringAttrs = [
    { key: 'disciplineTypeId', size: 36, required: true },
    { key: 'classId', size: 64, required: true },
    { key: 'description', size: 256, required: true },
    { key: 'data', size: 102400, required: false }, // 100KB for JSON
    { key: 'patterns', size: 102400, required: false }, // 100KB for JSON
    { key: 'createdAt', size: 64, required: true },
  ];

  for (const attr of stringAttrs) {
    try {
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        attr.key,
        attr.size,
        attr.required
      );
      console.log(`  ✓ Created attribute: ${attr.key}`);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(`  ⊖ Attribute already exists: ${attr.key}`);
      } else {
        throw error;
      }
    }
  }

  // Create integer attribute
  try {
    await databases.createIntegerAttribute(
      DATABASE_ID,
      collectionId,
      'defaultFlag',
      true,
      0,
      999
    );
    console.log('  ✓ Created attribute: defaultFlag');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log('  ⊖ Attribute already exists: defaultFlag');
    } else {
      throw error;
    }
  }

  // Wait for all attributes
  const allAttrKeys = [...stringAttrs.map(a => a.key), 'defaultFlag'];
  for (const key of allAttrKeys) {
    await waitForAttribute(databases, collectionId, key);
  }

  // Create indexes
  try {
    await databases.createIndex(
      DATABASE_ID,
      collectionId,
      'idx_type',
      IndexType.Key,
      ['disciplineTypeId']
    );
    console.log('  ✓ Created index: idx_type');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log('  ⊖ Index already exists: idx_type');
    } else {
      throw error;
    }
  }

  try {
    await databases.createIndex(
      DATABASE_ID,
      collectionId,
      'idx_class',
      IndexType.Key,
      ['classId']
    );
    console.log('  ✓ Created index: idx_class');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log('  ⊖ Index already exists: idx_class');
    } else {
      throw error;
    }
  }
}

// Create fields collection
async function createFieldsCollection(databases: Databases): Promise<void> {
  const collectionId = COLLECTION_IDS.FIELDS;
  console.log(`\nCreating ${collectionId} collection...`);

  try {
    await databases.createCollection(DATABASE_ID, collectionId, 'Fields', [], true);
    console.log(`  ✓ Created collection: ${collectionId}`);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log(`  ⊖ Collection already exists: ${collectionId}`);
    } else {
      throw error;
    }
  }

  // Create string attributes
  const stringAttrs = [
    { key: 'disciplineTypeId', size: 36, required: true },
    { key: 'name', size: 128, required: true },
    { key: 'arrayType', size: 64, required: false },
    { key: 'fieldType1', size: 64, required: false },
    { key: 'fieldType2', size: 64, required: false },
    { key: 'createdAt', size: 64, required: true },
  ];

  for (const attr of stringAttrs) {
    try {
      await databases.createStringAttribute(
        DATABASE_ID,
        collectionId,
        attr.key,
        attr.size,
        attr.required
      );
      console.log(`  ✓ Created attribute: ${attr.key}`);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(`  ⊖ Attribute already exists: ${attr.key}`);
      } else {
        throw error;
      }
    }
  }

  // Create integer attribute
  try {
    await databases.createIntegerAttribute(
      DATABASE_ID,
      collectionId,
      'arraySize',
      false,
      0,
      999999
    );
    console.log('  ✓ Created attribute: arraySize');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log('  ⊖ Attribute already exists: arraySize');
    } else {
      throw error;
    }
  }

  // Wait for all attributes
  const allAttrKeys = [...stringAttrs.map(a => a.key), 'arraySize'];
  for (const key of allAttrKeys) {
    await waitForAttribute(databases, collectionId, key);
  }

  // Create index
  try {
    await databases.createIndex(
      DATABASE_ID,
      collectionId,
      'idx_type',
      IndexType.Key,
      ['disciplineTypeId']
    );
    console.log('  ✓ Created index: idx_type');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log('  ⊖ Index already exists: idx_type');
    } else {
      throw error;
    }
  }
}

// Main function
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('IoT Alarm Management - Database Setup');
  console.log('='.repeat(60));

  try {
    validateEnvironment();
    const databases = initClient();

    await createDatabase(databases);
    await createDisciplinesCollection(databases);
    await createDisciplineTypesCollection(databases);
    await createAlarmPatternsCollection(databases);
    await createClassesCollection(databases);
    await createFieldsCollection(databases);

    console.log('\n' + '='.repeat(60));
    console.log('Database setup completed successfully!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\nSetup failed:', error);
    process.exit(1);
  }
}

// Run
main();
