/**
 * Mem0 Memory Integration Types
 *
 * These types define the structure for storing and retrieving
 * contextual memories across chat sessions and model switches.
 */

import type { Message } from 'ai';

/**
 * Core memory object stored in Mem0
 */
export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  metadata: MemoryMetadata;
  timestamp: number;
  userId?: string;
  chatId?: string;
}

/**
 * Types of memories that can be stored
 */
export type MemoryType =
  | 'project' // Project context and requirements
  | 'preference' // User coding preferences and style
  | 'decision' // Technical decisions made
  | 'structure' // File/project structure
  | 'highlight'; // Important conversation moments

/**
 * Metadata attached to each memory
 */
export interface MemoryMetadata {
  [key: string]: any;

  // Model information
  model?: string;
  provider?: string;

  // Context information
  artifactId?: string;
  messageId?: string;

  // Importance and confidence
  importance?: 'high' | 'medium' | 'low';
  confidence?: number; // 0-1

  // Technical details
  frameworks?: string[];
  libraries?: string[];
  techStack?: string[];

  // Decision tracking
  alternatives?: string[];
  reasoning?: string;

  // Structure information
  fileCount?: number;
  projectName?: string;
}

/**
 * Options for retrieving context
 */
export interface ContextOptions {
  chatId: string;
  messages?: Message[];
  files?: Record<string, any>;
  limit?: number;
  types?: MemoryType[];
  minImportance?: 'high' | 'medium' | 'low';
}

/**
 * Options for saving context
 */
export interface SaveContextOptions {
  chatId: string;
  content: string;
  type: MemoryType;
  metadata?: MemoryMetadata;
  importance?: 'high' | 'medium' | 'low';
}

/**
 * Context retrieved from memories
 */
export interface RetrievedContext {
  memories: Memory[];
  summary: string;
  formattedForPrompt: string;
  confidence: number;
}

/**
 * Memory search result
 */
export interface MemorySearchResult {
  memory: Memory;
  score: number; // Relevance score 0-1
  snippet: string; // Highlighted excerpt
}

/**
 * Memory extraction result
 */
export interface MemoryExtractionResult {
  memories: Memory[];
  summary: string;
  techStack?: string[];
  preferences?: string[];
}

/**
 * Auto-save configuration
 */
export interface AutoSaveConfig {
  enabled: boolean;
  debounceMs: number;
  minMessageLength: number;
  saveOnArtifactCreate: boolean;
  saveOnModelSwitch: boolean;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  total: number;
  byType: Record<MemoryType, number>;
  byImportance: Record<'high' | 'medium' | 'low', number>;
  oldestTimestamp: number;
  newestTimestamp: number;
}

/**
 * Mem0 service configuration
 */
export interface Mem0Config {
  apiKey?: string;
  baseUrl?: string;
  userId?: string;
  organizationId?: string;
  enabled: boolean;
}

/**
 * Memory storage backend
 */
export type MemoryBackend = 'mem0' | 'indexeddb' | 'session';

/**
 * Memory operation result
 */
export interface MemoryOperationResult {
  success: boolean;
  memoryId?: string;
  error?: string;
  backend: MemoryBackend;
}
