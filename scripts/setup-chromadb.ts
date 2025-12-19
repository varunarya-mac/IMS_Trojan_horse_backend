/**
 * ChromaDB Setup Script
 *
 * Processes the refrigeration knowledge document and uploads to ChromaDB Cloud.
 *
 * Usage: npx ts-node scripts/setup-chromadb.ts
 *
 * Prerequisites:
 *   - Set CHROMADB_TENANT, CHROMADB_API_KEY, CHROMADB_DATABASE, OPENAI_API_KEY in .env
 *   - Place the docx file at the path specified below
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Lazy imports to handle missing packages gracefully
let mammoth: typeof import('mammoth');
let OpenAI: typeof import('openai').default;
let CloudClient: typeof import('chromadb').CloudClient;

/**
 * Configuration
 */
const CONFIG = {
  // Document path - relative to project root
  DOCUMENT_PATH: './AdvancedSignallingTechniquesRefrigerationCases.docx',

  // ChromaDB Cloud settings
  CHROMADB_API_KEY: process.env.CHROMADB_API_KEY || '<CHROMADB_API_KEY_PLACEHOLDER>',
  CHROMADB_TENANT: process.env.CHROMADB_TENANT || '<CHROMADB_TENANT_PLACEHOLDER>',
  CHROMADB_DATABASE: process.env.CHROMADB_DATABASE || 'IMS_Alarm_management',

  // OpenAI settings
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '<OPENAI_API_KEY_PLACEHOLDER>',
  EMBEDDING_MODEL: 'text-embedding-3-small',

  // Chunking settings
  CHUNK_SIZE_TOKENS: 2000,
  CHUNK_OVERLAP_TOKENS: 150,
  CHARS_PER_TOKEN: 5, // Approximate
};

/**
 * Text chunk with metadata
 */
interface TextChunk {
  id: string;
  text: string;
  metadata: {
    source: string;
    chunkIndex: number;
    startChar: number;
    endChar: number;
    section?: string;
  };
}

/**
 * Load dependencies
 */
async function loadDependencies(): Promise<void> {
  try {
    mammoth = await import('mammoth');
    const openaiModule = await import('openai');
    OpenAI = openaiModule.default;
    const chromaModule = await import('chromadb');
    CloudClient = chromaModule.CloudClient;
  } catch (error) {
    console.error('Missing dependencies. Please install:');
    console.error('  npm install mammoth openai chromadb dotenv');
    process.exit(1);
  }
}

/**
 * Extract text from docx file
 */
async function extractTextFromDocx(filePath: string): Promise<string> {
  console.log(`Reading document: ${filePath}`);

  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Document not found: ${absolutePath}`);
  }

  const result = await mammoth.extractRawText({ path: absolutePath });
  const text = result.value;

  console.log(`Extracted ${text.length} characters`);

  return text;
}

/**
 * Simple text chunking with overlap
 */
function chunkText(text: string, source: string): TextChunk[] {
  const chunkSizeChars = CONFIG.CHUNK_SIZE_TOKENS * CONFIG.CHARS_PER_TOKEN;
  const overlapChars = CONFIG.CHUNK_OVERLAP_TOKENS * CONFIG.CHARS_PER_TOKEN;

  const chunks: TextChunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  // Clean up text
  const cleanedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  while (startIndex < cleanedText.length) {
    // Find end of chunk
    let endIndex = startIndex + chunkSizeChars;

    if (endIndex < cleanedText.length) {
      // Try to find a good break point (end of sentence or paragraph)
      const searchStart = Math.max(startIndex + chunkSizeChars - 100, startIndex);
      const searchEnd = Math.min(startIndex + chunkSizeChars + 100, cleanedText.length);
      const searchText = cleanedText.substring(searchStart, searchEnd);

      // Look for paragraph break first
      const paragraphBreak = searchText.indexOf('\n\n');
      if (paragraphBreak !== -1) {
        endIndex = searchStart + paragraphBreak + 2;
      } else {
        // Look for sentence break
        const sentenceBreak = searchText.search(/[.!?]\s/);
        if (sentenceBreak !== -1) {
          endIndex = searchStart + sentenceBreak + 2;
        }
      }
    } else {
      endIndex = cleanedText.length;
    }

    const chunkText = cleanedText.substring(startIndex, endIndex).trim();

    if (chunkText.length > 0) {
      // Try to extract section from first line
      const firstLine = chunkText.split('\n')[0];
      const section = firstLine.length < 100 ? firstLine : undefined;

      chunks.push({
        id: `chunk_${chunkIndex}`,
        text: chunkText,
        metadata: {
          source,
          chunkIndex,
          startChar: startIndex,
          endChar: endIndex,
          section,
        },
      });

      chunkIndex++;
    }

    // Move start with overlap
    startIndex = endIndex - overlapChars;
    if (startIndex <= chunks[chunks.length - 1]?.metadata.startChar) {
      startIndex = endIndex; // Prevent infinite loop
    }
  }

  console.log(`Created ${chunks.length} chunks`);
  return chunks;
}

/**
 * Generate document summary from ALL chunks using GPT-4o
 */
async function generateDocumentSummary(
  chunks: TextChunk[],
  openai: InstanceType<typeof OpenAI>
): Promise<string> {
  console.log(`\nGenerating document summary from ALL ${chunks.length} chunks...`);

  // Combine all chunks for summary
  const allContent = chunks.map((c, i) => `[Section ${i + 1}]\n${c.text}`).join('\n\n---\n\n');
  console.log(`  Total content size: ${allContent.length} characters`);

  // GPT-4o has ~128k context window (~500k chars)
  const maxCharsPerRequest = 400000; // Safe limit ~100k tokens

  if (allContent.length <= maxCharsPerRequest) {
    // All content fits in one request
    console.log('  Processing all chunks in single request...');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a technical documentation expert specializing in refrigeration systems and IoT monitoring.
Create a comprehensive, detailed summary of this refrigeration knowledge document that covers:
1. Key concepts and terminology
2. Common alarm patterns and their meanings
3. Diagnostic techniques and signal analysis methods
4. Troubleshooting procedures and decision trees
5. Best practices and recommendations
6. Equipment types and their characteristics

The summary should be thorough enough to help answer technical questions about refrigeration systems when specific context isn't available.
Structure the summary with clear headings and bullet points for easy reference.`
        },
        {
          role: 'user',
          content: `Please create a comprehensive summary of the following refrigeration technical documentation:\n\n${allContent}`
        }
      ],
      max_tokens: 5000,
      temperature: 0.3,
    });

    const summary = response.choices[0].message.content || '';
    console.log(`  Generated summary: ${summary.length} characters`);
    return summary;
  } else {
    // Content too long - process in batches and combine summaries
    console.log('  Content too large, processing in batches...');

    const batchSummaries: string[] = [];
    let currentBatch = '';
    let batchIndex = 0;

    for (const chunk of chunks) {
      if (currentBatch.length + chunk.text.length > maxCharsPerRequest) {
        // Process current batch
        batchIndex++;
        console.log(`  Processing batch ${batchIndex}...`);

        const batchResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'Summarize this section of a refrigeration technical document. Focus on key concepts, alarm patterns, diagnostic procedures, and actionable information. Be detailed and comprehensive.'
            },
            {
              role: 'user',
              content: currentBatch
            }
          ],
          max_tokens: 3000,
          temperature: 0.3,
        });

        batchSummaries.push(batchResponse.choices[0].message.content || '');
        currentBatch = chunk.text;

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        currentBatch += '\n\n---\n\n' + chunk.text;
      }
    }

    // Process final batch
    if (currentBatch.length > 0) {
      batchIndex++;
      console.log(`  Processing batch ${batchIndex}...`);

      const batchResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'Summarize this section of a refrigeration technical document. Focus on key concepts, alarm patterns, diagnostic procedures, and actionable information. Be detailed and comprehensive.'
          },
          {
            role: 'user',
            content: currentBatch
          }
        ],
        max_tokens: 3000,
        temperature: 0.3,
      });

      batchSummaries.push(batchResponse.choices[0].message.content || '');
    }

    // Combine all batch summaries into final summary
    console.log(`  Combining ${batchSummaries.length} batch summaries into final summary...`);
    const combinedSummaries = batchSummaries.join('\n\n---\n\n');

    const finalResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a technical documentation expert. Combine these section summaries into one comprehensive, well-organized summary of a refrigeration technical document.
Include all of the following with clear headings:
1. Key concepts and terminology
2. Common alarm patterns and their meanings
3. Diagnostic techniques and signal analysis methods
4. Troubleshooting procedures
5. Best practices and recommendations
6. Equipment types and characteristics

Make it detailed and comprehensive - this will be used as fallback knowledge when specific information isn't found.`
        },
        {
          role: 'user',
          content: `Combine these section summaries into a comprehensive document summary:\n\n${combinedSummaries}`
        }
      ],
      max_tokens: 5000,
      temperature: 0.3,
    });

    const summary = finalResponse.choices[0].message.content || '';
    console.log(`  Generated final summary: ${summary.length} characters`);
    return summary;
  }
}

/**
 * Generate embeddings using OpenAI
 */
async function generateEmbeddings(
  chunks: TextChunk[],
  openai: InstanceType<typeof OpenAI>
): Promise<number[][]> {
  console.log(`Generating embeddings for ${chunks.length} chunks...`);

  const embeddings: number[][] = [];
  const batchSize = 100; // OpenAI batch limit

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map((c) => c.text);

    console.log(`  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);

    const response = await openai.embeddings.create({
      model: CONFIG.EMBEDDING_MODEL,
      input: texts,
    });

    for (const embedding of response.data) {
      embeddings.push(embedding.embedding);
    }

    // Rate limiting
    if (i + batchSize < chunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(`Generated ${embeddings.length} embeddings`);
  return embeddings;
}

/**
 * Upload to ChromaDB Cloud
 */
async function uploadToChromaDB(
  chunks: TextChunk[],
  embeddings: number[][]
): Promise<void> {
  console.log(`Connecting to ChromaDB Cloud...`);
  console.log(`  Tenant: ${CONFIG.CHROMADB_TENANT}`);
  console.log(`  Database: ${CONFIG.CHROMADB_DATABASE}`);

  // Check for placeholder values
  if (CONFIG.CHROMADB_API_KEY.includes('PLACEHOLDER')) {
    console.error('\nERROR: ChromaDB API key not configured.');
    console.error('Please set CHROMADB_API_KEY in your .env file.\n');
    process.exit(1);
  }

  if (CONFIG.CHROMADB_TENANT.includes('PLACEHOLDER')) {
    console.error('\nERROR: ChromaDB tenant not configured.');
    console.error('Please set CHROMADB_TENANT in your .env file.\n');
    process.exit(1);
  }

  const client = new CloudClient({
    apiKey: CONFIG.CHROMADB_API_KEY,
    tenant: CONFIG.CHROMADB_TENANT,
    database: CONFIG.CHROMADB_DATABASE,
  });

  // Get or create collection (using database name as collection name)
  console.log(`Getting/creating collection: ${CONFIG.CHROMADB_DATABASE}`);
  const collection = await client.getOrCreateCollection({
    name: CONFIG.CHROMADB_DATABASE,
    metadata: {
      description: 'IoT Refrigeration domain knowledge for RAG',
      source: 'Advanced Signalling Techniques - Refrigeration Cases',
    },
  });

  // Clear existing documents
  console.log('Clearing existing documents...');
  try {
    const existingIds = (await collection.get()).ids;
    if (existingIds.length > 0) {
      await collection.delete({ ids: existingIds });
      console.log(`  Deleted ${existingIds.length} existing documents`);
    }
  } catch {
    // Collection might be empty, ignore
  }

  // Upload in batches
  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batchChunks = chunks.slice(i, i + batchSize);
    const batchEmbeddings = embeddings.slice(i, i + batchSize);

    console.log(`  Uploading batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);

    await collection.add({
      ids: batchChunks.map((c) => c.id),
      embeddings: batchEmbeddings,
      documents: batchChunks.map((c) => c.text),
      metadatas: batchChunks.map((c) => c.metadata as Record<string, string | number>),
    });
  }

  console.log(`\nUploaded ${chunks.length} documents to ChromaDB`);

  // Verify
  const count = await collection.count();
  console.log(`Collection now has ${count} documents`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('ChromaDB Setup Script');
  console.log('='.repeat(60));
  console.log();

  // Load dependencies
  await loadDependencies();

  // Check OpenAI API key
  if (CONFIG.OPENAI_API_KEY.includes('PLACEHOLDER')) {
    console.error('\nERROR: OpenAI API key not configured.');
    console.error('Please set OPENAI_API_KEY in your .env file.\n');
    process.exit(1);
  }

  // Initialize OpenAI client
  const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });

  // Extract text from document
  const text = await extractTextFromDocx(CONFIG.DOCUMENT_PATH);

  // Chunk the text
  const fileName = path.basename(CONFIG.DOCUMENT_PATH);
  const chunks = chunkText(text, fileName);

  if (chunks.length === 0) {
    console.error('No chunks created. Check the document content.');
    process.exit(1);
  }

  // Show sample chunk
  console.log('\nSample chunk:');
  console.log('-'.repeat(40));
  console.log(chunks[0].text.substring(0, 200) + '...');
  console.log('-'.repeat(40));
  console.log();

  // Generate document summary from ALL chunks
  const documentSummary = await generateDocumentSummary(chunks, openai);

  // Add summary as a special chunk
  const summaryChunk: TextChunk = {
    id: 'document_summary',
    text: documentSummary,
    metadata: {
      source: fileName,
      chunkIndex: -1,
      startChar: 0,
      endChar: documentSummary.length,
      section: 'DOCUMENT_SUMMARY',
    },
  };

  // Add summary to chunks array
  const allChunks = [...chunks, summaryChunk];
  console.log(`\nTotal chunks including summary: ${allChunks.length}`);

  // Generate embeddings for all chunks including summary
  const embeddings = await generateEmbeddings(allChunks, openai);

  // Upload to ChromaDB
  await uploadToChromaDB(allChunks, embeddings);

  console.log('\n' + '='.repeat(60));
  console.log('Setup complete!');
  console.log('='.repeat(60));
  console.log('\nSummary preview:');
  console.log('-'.repeat(40));
  console.log(documentSummary.substring(0, 500) + '...');
  console.log('-'.repeat(40));
}

// Run
main().catch((error) => {
  console.error('\nFatal error:', error.message);
  process.exit(1);
});
