/**
 * Database Setup Script for IoT Refrigeration Chat Feature
 *
 * Creates collections and storage buckets required for the chat feature.
 * Run with: npm run setup-refrigeration-db
 */

import { Client, Databases, Storage, Permission, Role, IndexType } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'iot_alarm_management';

/**
 * Collection definitions
 */
const COLLECTIONS = {
  chats: {
    name: 'Chats',
    attributes: [
      { key: 'userId', type: 'string', size: 36, required: true },
      { key: 'title', type: 'string', size: 255, required: true },
      { key: 'status', type: 'string', size: 20, required: true },
      { key: 'csvFileId', type: 'string', size: 36, required: false },
      { key: 'csvFileName', type: 'string', size: 255, required: false },
      { key: 'csvFileSize', type: 'integer', required: false },
      { key: 'deviceType', type: 'string', size: 20, required: false },
      { key: 'storeInfo', type: 'string', size: 2000, required: false },
      { key: 'metadata', type: 'string', size: 5000, required: false },
    ],
    indexes: [
      { key: 'userId_idx', type: IndexType.Key, attributes: ['userId'] },
      { key: 'status_idx', type: IndexType.Key, attributes: ['status'] },
      { key: 'userId_status_idx', type: IndexType.Key, attributes: ['userId', 'status'] },
    ],
  },
  messages: {
    name: 'Messages',
    attributes: [
      { key: 'chatId', type: 'string', size: 36, required: true },
      { key: 'role', type: 'string', size: 20, required: true },
      { key: 'content', type: 'string', size: 50000, required: true },
      { key: 'contentType', type: 'string', size: 20, required: true },
      { key: 'summaryData', type: 'string', size: 100000, required: false },
      { key: 'graphImageId', type: 'string', size: 36, required: false },
      { key: 'datapointsData', type: 'string', size: 50000, required: false },
      { key: 'processingTime', type: 'integer', required: false },
      { key: 'tokenUsage', type: 'string', size: 500, required: false },
    ],
    indexes: [
      { key: 'chatId_idx', type: IndexType.Key, attributes: ['chatId'] },
      { key: 'chatId_role_idx', type: IndexType.Key, attributes: ['chatId', 'role'] },
    ],
  },
  chatContext: {
    name: 'Chat Context',
    attributes: [
      { key: 'chatId', type: 'string', size: 36, required: true },
      { key: 'csvData', type: 'string', size: 500000, required: false },
      { key: 'csvFileId', type: 'string', size: 36, required: false },
      { key: 'lastUpdated', type: 'datetime', required: true },
      { key: 'expiresAt', type: 'datetime', required: true },
    ],
    indexes: [
      { key: 'chatId_idx', type: IndexType.Key, attributes: ['chatId'] },
      { key: 'expiresAt_idx', type: IndexType.Key, attributes: ['expiresAt'] },
    ],
  },
};

/**
 * Storage bucket definitions
 * Using single bucket for all refrigeration files (CSV + graphs)
 */
const BUCKETS = {
  'refrigeration-files': {
    name: 'Refrigeration Files',
    permissions: [
      Permission.read(Role.any()),
      Permission.create(Role.users()),
      Permission.delete(Role.users()),
    ],
    fileSizeLimit: 50000000, // ~50MB (API limit)
    allowedFileExtensions: ['csv', 'png', 'jpg', 'jpeg'],
    compression: 'none' as const,
    encryption: true,
    antivirus: true,
  },
};

async function main() {
  console.log('🚀 Starting IoT Refrigeration Database Setup...\n');

  // Initialize Appwrite client
  const client = new Client();
  client
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_PROJECT_ID || '')
    .setKey(process.env.APPWRITE_API_KEY || '');

  const databases = new Databases(client);
  const storage = new Storage(client);

  // Create collections
  console.log('📦 Creating collections...\n');

  for (const [collectionId, config] of Object.entries(COLLECTIONS)) {
    console.log(`Creating collection: ${collectionId}`);

    try {
      // Create collection
      await databases.createCollection(
        DATABASE_ID,
        collectionId,
        config.name,
        [
          Permission.read(Role.any()),
          Permission.create(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users()),
        ]
      );
      console.log(`  ✅ Collection created: ${collectionId}`);

      // Create attributes
      for (const attr of config.attributes) {
        console.log(`  Creating attribute: ${attr.key}`);

        if (attr.type === 'string') {
          await databases.createStringAttribute(
            DATABASE_ID,
            collectionId,
            attr.key,
            attr.size,
            attr.required
          );
        } else if (attr.type === 'integer') {
          await databases.createIntegerAttribute(
            DATABASE_ID,
            collectionId,
            attr.key,
            attr.required
          );
        } else if (attr.type === 'datetime') {
          await databases.createDatetimeAttribute(
            DATABASE_ID,
            collectionId,
            attr.key,
            attr.required
          );
        }

        // Small delay to avoid rate limiting
        await sleep(500);
      }

      console.log(`  ✅ Attributes created for ${collectionId}`);

      // Wait for attributes to be ready before creating indexes
      console.log(`  Waiting for attributes to be ready...`);
      await sleep(3000);

      // Create indexes
      for (const index of config.indexes) {
        console.log(`  Creating index: ${index.key}`);
        await databases.createIndex(
          DATABASE_ID,
          collectionId,
          index.key,
          index.type,
          index.attributes
        );
        await sleep(500);
      }

      console.log(`  ✅ Indexes created for ${collectionId}\n`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(`  ⚠️ Collection ${collectionId} already exists, skipping...\n`);
      } else {
        throw error;
      }
    }
  }

  // Create storage buckets
  console.log('🗄️ Creating storage buckets...\n');

  for (const [bucketId, config] of Object.entries(BUCKETS)) {
    console.log(`Creating bucket: ${bucketId}`);

    try {
      await storage.createBucket(
        bucketId,
        config.name,
        config.permissions,
        false, // fileSecurity
        true, // enabled
        config.fileSizeLimit,
        config.allowedFileExtensions,
        config.compression,
        config.encryption,
        config.antivirus
      );
      console.log(`  ✅ Bucket created: ${bucketId}\n`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(`  ⚠️ Bucket ${bucketId} already exists, skipping...\n`);
      } else {
        throw error;
      }
    }
  }

  console.log('✨ Database setup complete!\n');
  console.log('Collections created:');
  Object.keys(COLLECTIONS).forEach(c => console.log(`  - ${c}`));
  console.log('\nStorage buckets created:');
  Object.keys(BUCKETS).forEach(b => console.log(`  - ${b}`));
  console.log('\nEnvironment variables to add:');
  console.log('  OPENAI_API_KEY=<your-key>');
  console.log('  OPENAI_MODEL=gpt-4o');
  console.log('  OPENAI_GUARDRAIL_MODEL=gpt-4o-mini');
  console.log('  REFRIGERATION_BUCKET_ID=refrigeration-files');
  console.log('  CHROMADB_HOST=<your-chromadb-host>');
  console.log('  CHROMADB_API_KEY=<your-chromadb-api-key>');
  console.log('  CHROMADB_COLLECTION=refrigeration-knowledge');
  console.log('  CONTEXT_MESSAGE_COUNT=3');
  console.log('  CONTEXT_EXPIRY_HOURS=24');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(error => {
  console.error('❌ Setup failed:', error);
  process.exit(1);
});
