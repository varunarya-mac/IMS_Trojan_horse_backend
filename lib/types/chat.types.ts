/**
 * Chat Entity Types
 * These interfaces represent chat-related documents stored in Appwrite collections
 */

import type { BaseEntity } from './entities.js';

/**
 * Chat status enum
 */
export type ChatStatus = 'active' | 'processing' | 'completed' | 'error';

/**
 * Device type detected from CSV
 */
export type DeviceType = 'pack' | 'case' | 'mixed';

/**
 * Chat entity - represents a conversation session
 */
export interface ChatEntity extends BaseEntity {
  /** Appwrite user ID */
  userId: string;

  /** Display title (auto-generated or user-provided) */
  title: string;

  /** Current processing status */
  status: ChatStatus;

  /** Reference to uploaded CSV file in storage */
  csvFileId: string | null;

  /** Original filename of uploaded CSV */
  csvFileName: string | null;

  /** File size in bytes */
  csvFileSize: number | null;

  /** Detected device type from CSV */
  deviceType: DeviceType | null;

  /** Extracted store information (JSON string) */
  storeInfo: string | null;

  /** Extracted CSV metadata (JSON string) */
  metadata: string | null;
}

/**
 * Parsed store information from CSV
 */
export interface StoreInfo {
  storeNumber: string | null;
  storeName: string | null;
  caseId: string | null;
  packId: string | null;
  caseClass: string | null;
  packClass: string | null;
  caseName: string | null;
  packName: string | null;
}

/**
 * Parsed CSV metadata
 */
export interface CSVMetadata {
  rowCount: number;
  columnCount: number;
  columns: string[];
  timeRange: {
    start: string;
    end: string;
  } | null;
  hasPackData: boolean;
  hasCaseData: boolean;
  fileSizeBytes: number;
}

/**
 * Chat DTO for API responses
 */
export interface ChatDTO {
  id: string;
  userId: string;
  title: string;
  status: ChatStatus;
  csvFileId: string | null;
  csvFileName: string | null;
  csvFileSize: number | null;
  deviceType: DeviceType | null;
  storeInfo: StoreInfo | null;
  metadata: CSVMetadata | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Chat list item DTO (lighter version for list views)
 */
export interface ChatListItemDTO {
  id: string;
  title: string;
  status: ChatStatus;
  deviceType: DeviceType | null;
  csvFileName: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create chat request
 */
export interface CreateChatRequest {
  title?: string;
}

/**
 * Create chat response
 */
export interface CreateChatResponse {
  chatId: string;
  title: string;
  status: ChatStatus;
  createdAt: string;
}

/**
 * List chats request query params
 */
export interface ListChatsRequest {
  limit?: number;      // Default: 20, Max: 100
  offset?: number;     // Default: 0
  status?: ChatStatus; // Filter by status
}

/**
 * List chats response
 */
export interface ListChatsResponse {
  chats: ChatListItemDTO[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Get chat response (includes messages)
 */
export interface GetChatResponse {
  chat: ChatDTO;
  storeInfo: StoreInfo | null;
  csvMetadata: CSVMetadata | null;
}

/**
 * Delete chat response
 */
export interface DeleteChatResponse {
  success: boolean;
  deletedResources: {
    chat: boolean;
    messages: number;
    csvFile: boolean;
    graphFiles: number;
    jobs: number;
  };
}
