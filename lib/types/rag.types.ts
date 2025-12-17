/**
 * RAG (Retrieval-Augmented Generation) Types
 * Types for vector search and document retrieval
 */

/**
 * Document chunk for vector storage
 */
export interface DocumentChunk {
  /** Unique chunk identifier */
  id: string;

  /** The text content of this chunk */
  content: string;

  /** Metadata about the chunk */
  metadata: ChunkMetadata;

  /** Vector embedding (populated during search results) */
  embedding?: number[];
}

/**
 * Metadata for document chunks
 */
export interface ChunkMetadata {
  /** Source document identifier */
  documentId: string;

  /** Source document name/title */
  documentName: string;

  /** Section or heading this chunk belongs to */
  section?: string;

  /** Page number in original document */
  pageNumber?: number;

  /** Character offset in original document */
  charOffset?: number;

  /** Chunk index within document */
  chunkIndex: number;

  /** Total chunks in document */
  totalChunks: number;

  /** When the chunk was created */
  createdAt: string;
}

/**
 * Vector search request
 */
export interface VectorSearchRequest {
  /** The query text to search for */
  query: string;

  /** Maximum number of results to return */
  topK?: number;

  /** Minimum similarity score (0-1) */
  minScore?: number;

  /** Filter by document IDs */
  documentIds?: string[];

  /** Filter by metadata fields */
  metadataFilter?: Record<string, string | number | boolean>;

  /** Whether to include embeddings in results */
  includeEmbeddings?: boolean;
}

/**
 * Vector search response
 */
export interface VectorSearchResponse {
  /** Search results */
  results: VectorSearchResult[];

  /** Query used */
  query: string;

  /** Total matches found */
  totalMatches: number;

  /** Time taken in milliseconds */
  searchTimeMs: number;
}

/**
 * Individual search result
 */
export interface VectorSearchResult {
  /** The document chunk */
  chunk: DocumentChunk;

  /** Similarity score (0-1, higher is more similar) */
  score: number;

  /** Distance from query (if applicable) */
  distance?: number;
}

/**
 * Document indexing request
 */
export interface IndexDocumentRequest {
  /** Document identifier */
  documentId: string;

  /** Document name/title */
  documentName: string;

  /** Full document content */
  content: string;

  /** Chunking options */
  chunkOptions?: ChunkOptions;
}

/**
 * Chunking options for document indexing
 */
export interface ChunkOptions {
  /** Target chunk size in tokens */
  chunkSize?: number;

  /** Overlap between chunks in tokens */
  chunkOverlap?: number;

  /** Whether to split on section boundaries */
  splitOnSections?: boolean;

  /** Separator patterns for splitting */
  separators?: string[];
}

/**
 * Document indexing response
 */
export interface IndexDocumentResponse {
  /** Document identifier */
  documentId: string;

  /** Number of chunks created */
  chunkCount: number;

  /** Whether indexing was successful */
  success: boolean;

  /** Error message if failed */
  error?: string;
}

/**
 * ChromaDB collection info
 */
export interface CollectionInfo {
  /** Collection name */
  name: string;

  /** Number of documents in collection */
  documentCount: number;

  /** Embedding dimension */
  embeddingDimension: number;

  /** Distance metric used */
  distanceMetric: 'cosine' | 'l2' | 'ip';
}

/**
 * Health check response for vector search service
 */
export interface VectorSearchHealthResponse {
  /** Whether the service is healthy */
  healthy: boolean;

  /** ChromaDB connection status */
  chromadbConnected: boolean;

  /** OpenAI embeddings status */
  embeddingsAvailable: boolean;

  /** Collection info if available */
  collection?: CollectionInfo;

  /** Error message if unhealthy */
  error?: string;
}
