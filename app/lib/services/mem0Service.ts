/**
 * Mem0 Service - Core integration layer for Mem0 memory API
 *
 * This service provides:
 * - CRUD operations for memories
 * - Semantic search over memories
 * - Context retrieval and formatting
 * - Fallback to IndexedDB when Mem0 unavailable
 * - Rate limiting and error handling
 */

import { MemoryClient } from 'mem0ai';
import type {
  Memory,
  MemoryMetadata,
  ContextOptions,
  RetrievedContext,
  MemorySearchResult,
  Mem0Config,
  MemoryOperationResult,
} from '~/types/memory';

/**
 * IndexedDB fallback for storing memories locally
 */
class MemoryIndexedDBBackup {
  private _dbName = 'mem0-backup';
  private _storeName = 'memories';
  private _db: IDBDatabase | null = null;
  private _isAvailable = false;

  /**
   * Check if IndexedDB is available in current environment
   */
  private _checkAvailability(): boolean {
    if (typeof window === 'undefined') {
      console.warn('[Mem0IndexedDB] Not available - running in server environment');
      return false;
    }

    if (typeof indexedDB === 'undefined') {
      console.warn('[Mem0IndexedDB] Not available - indexedDB not supported by browser');
      return false;
    }

    return true;
  }

  async init(): Promise<void> {
    if (!this._checkAvailability()) {
      this._isAvailable = false;

      return Promise.resolve();
    }

    try {
      console.log('[Mem0IndexedDB] Initializing database...');

      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this._dbName, 1);

        request.onerror = () => {
          console.error('[Mem0IndexedDB] Failed to open database:', request.error);
          this._isAvailable = false;
          reject(request.error);
        };

        request.onsuccess = () => {
          this._db = request.result;
          this._isAvailable = true;
          console.log('[Mem0IndexedDB] Database initialized successfully');
          resolve();
        };

        request.onupgradeneeded = (event) => {
          console.log('[Mem0IndexedDB] Upgrading database schema...');

          const db = (event.target as IDBOpenDBRequest).result;

          if (!db.objectStoreNames.contains(this._storeName)) {
            const store = db.createObjectStore(this._storeName, { keyPath: 'id' });
            store.createIndex('chatId', 'chatId', { unique: false });
            store.createIndex('type', 'type', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            console.log('[Mem0IndexedDB] Object store created');
          }
        };
      });
    } catch (error) {
      console.error('[Mem0IndexedDB] Initialization error:', error);
      this._isAvailable = false;
      throw error;
    }
  }

  async saveMemory(memory: Memory): Promise<void> {
    if (!this._isAvailable && !this._db) {
      await this.init();
    }

    if (!this._db) {
      throw new Error('IndexedDB is not available. This feature requires browser storage support.');
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this._db!.transaction([this._storeName], 'readwrite');
        const store = transaction.objectStore(this._storeName);
        const request = store.put(memory);

        request.onsuccess = () => {
          console.log('[Mem0IndexedDB] Memory saved:', memory.id);
          resolve();
        };

        request.onerror = () => {
          console.error('[Mem0IndexedDB] Failed to save memory:', request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('[Mem0IndexedDB] Transaction error:', error);
        reject(error);
      }
    });
  }

  async getMemories(filters?: { chatId?: string; type?: string }): Promise<Memory[]> {
    if (!this._isAvailable && !this._db) {
      await this.init().catch(() => {
        /* ignore */
      });
    }

    if (!this._db) {
      console.warn('[Mem0IndexedDB] Cannot get memories - database not available');
      return [];
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this._db!.transaction([this._storeName], 'readonly');
        const store = transaction.objectStore(this._storeName);

        let request: IDBRequest;

        if (filters?.chatId) {
          const index = store.index('chatId');
          request = index.getAll(filters.chatId);
        } else if (filters?.type) {
          const index = store.index('type');
          request = index.getAll(filters.type);
        } else {
          request = store.getAll();
        }

        request.onsuccess = () => {
          console.log(`[Mem0IndexedDB] Retrieved ${request.result?.length || 0} memories`);
          resolve(request.result || []);
        };

        request.onerror = () => {
          console.error('[Mem0IndexedDB] Failed to get memories:', request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('[Mem0IndexedDB] Transaction error:', error);
        reject(error);
      }
    });
  }

  async deleteMemory(memoryId: string): Promise<void> {
    if (!this._isAvailable && !this._db) {
      await this.init();
    }

    if (!this._db) {
      throw new Error('IndexedDB is not available. This feature requires browser storage support.');
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this._db!.transaction([this._storeName], 'readwrite');
        const store = transaction.objectStore(this._storeName);
        const request = store.delete(memoryId);

        request.onsuccess = () => {
          console.log('[Mem0IndexedDB] Memory deleted:', memoryId);
          resolve();
        };

        request.onerror = () => {
          console.error('[Mem0IndexedDB] Failed to delete memory:', request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('[Mem0IndexedDB] Transaction error:', error);
        reject(error);
      }
    });
  }

  async searchMemories(query: string): Promise<Memory[]> {
    // Simple keyword-based search for fallback
    const allMemories = await this.getMemories();
    const queryLower = query.toLowerCase();

    const results = allMemories.filter(
      (memory) =>
        memory.content.toLowerCase().includes(queryLower) ||
        (memory.metadata.projectName && memory.metadata.projectName.toLowerCase().includes(queryLower)),
    );

    console.log(`[Mem0IndexedDB] Search found ${results.length} results for query:`, query);

    return results;
  }
}

/**
 * Main Mem0 service class
 */
export class Mem0Service {
  private _client: MemoryClient | null = null;
  config: Mem0Config;
  private _indexedDB: MemoryIndexedDBBackup;
  private _isInitialized = false;

  constructor(config: Mem0Config) {
    console.log('[Mem0Service] Initializing with config:', {
      enabled: config.enabled,
      hasApiKey: !!config.apiKey,
      userId: config.userId,
    });

    this.config = config;
    this._indexedDB = new MemoryIndexedDBBackup();

    if (config.enabled && config.apiKey) {
      try {
        console.log('[Mem0Service] Creating Mem0 client...');
        this._client = new MemoryClient({
          apiKey: config.apiKey,
        });
        this._isInitialized = true;
        console.log('[Mem0Service] Mem0 client initialized successfully');
      } catch (error) {
        console.error('[Mem0Service] Failed to initialize Mem0 client:', error);
        console.log('[Mem0Service] Falling back to IndexedDB only');
      }
    } else {
      if (!config.enabled) {
        console.log('[Mem0Service] Mem0 is disabled in config');
      }

      if (!config.apiKey) {
        console.log('[Mem0Service] No API key provided - using IndexedDB only');
      }
    }
  }

  /**
   * Check if Mem0 is available
   */
  isAvailable(): boolean {
    const available = this._isInitialized && this._client !== null;
    console.log('[Mem0Service] Mem0 API available:', available);

    return available;
  }

  /**
   * Add a new memory
   */
  async addMemory(content: string, metadata: MemoryMetadata = {}): Promise<MemoryOperationResult> {
    console.log('[Mem0Service] Adding memory:', {
      contentLength: content.length,
      type: metadata.importance === 'high' ? 'highlight' : 'project',
      chatId: metadata.chatId,
    });

    const memory: Memory = {
      id: crypto.randomUUID(),
      content,
      type: metadata.importance === 'high' ? 'highlight' : 'project',
      metadata,
      timestamp: Date.now(),
      userId: this.config.userId,
      chatId: metadata.chatId as string | undefined,
    };

    // Try Mem0 first
    if (this._isAvailable()) {
      try {
        console.log('[Mem0Service] Saving to Mem0 API...');

        const messages = [{ role: 'user' as const, content }];
        await this._client!.add(messages, {
          user_id: this.config.userId || 'default',
          metadata,
        });

        console.log('[Mem0Service] Successfully saved to Mem0 API');

        // Also backup to IndexedDB
        try {
          await this._indexedDB.saveMemory(memory);
          console.log('[Mem0Service] Also backed up to IndexedDB');
        } catch (dbError) {
          console.warn('[Mem0Service] IndexedDB backup failed (non-critical):', dbError);
        }

        return {
          success: true,
          memoryId: memory.id,
          backend: 'mem0',
        };
      } catch (error: any) {
        console.error('[Mem0Service] Mem0 API add failed:', {
          message: error?.message,
          status: error?.status,
          error,
        });
        console.log('[Mem0Service] Falling back to IndexedDB...');
      }
    } else {
      console.log('[Mem0Service] Mem0 not available, using IndexedDB directly');
    }

    // Fallback to IndexedDB only
    try {
      await this._indexedDB.saveMemory(memory);
      console.log('[Mem0Service] Successfully saved to IndexedDB');

      return {
        success: true,
        memoryId: memory.id,
        backend: 'indexeddb',
      };
    } catch (error: any) {
      console.error('[Mem0Service] IndexedDB save failed:', error);
      return {
        success: false,
        error: error?.message || 'Failed to save memory to IndexedDB',
        backend: 'indexeddb',
      };
    }
  }

  /**
   * Get all memories for a user
   */
  async getMemories(filters?: { chatId?: string; type?: string; limit?: number }): Promise<Memory[]> {
    // Try Mem0 first
    if (this._isAvailable()) {
      try {
        const result = (await this._client!.getAll({
          user_id: this.config.userId || 'default',
        })) as any;

        // Transform Mem0 format to our Memory format
        const memories: Memory[] = ((result.results || result || []) as any[]).map((item: any) => ({
          id: item.id || crypto.randomUUID(),
          content: item.memory || item.text || '',
          type: 'project',
          metadata: item.metadata || {},
          timestamp: new Date(item.created_at || Date.now()).getTime(),
          userId: this.config.userId,
          chatId: item.metadata?.chatId,
        }));

        // Apply filters
        let filtered = memories;

        if (filters?.chatId) {
          filtered = filtered.filter((m) => m.chatId === filters.chatId);
        }

        if (filters?.type) {
          filtered = filtered.filter((m) => m.type === filters.type);
        }

        if (filters?.limit) {
          filtered = filtered.slice(0, filters.limit);
        }

        return filtered;
      } catch (error) {
        console.error('[Mem0Service] Mem0 getAll failed, falling back to IndexedDB:', error);
      }
    }

    // Fallback to IndexedDB
    return await this._indexedDB.getMemories(filters);
  }

  /**
   * Search memories by query
   */
  async searchMemories(query: string, filters?: { chatId?: string; limit?: number }): Promise<MemorySearchResult[]> {
    // Try Mem0 semantic search first
    if (this._isAvailable()) {
      try {
        const result = (await this._client!.search(query, {
          user_id: this.config.userId || 'default',
          limit: filters?.limit || 10,
        })) as any;

        // Transform to MemorySearchResult
        return ((result.results || result || []) as any[]).map((item: any) => ({
          memory: {
            id: item.id || crypto.randomUUID(),
            content: item.memory || item.text || '',
            type: 'project',
            metadata: item.metadata || {},
            timestamp: new Date(item.created_at || Date.now()).getTime(),
            userId: this.config.userId,
            chatId: item.metadata?.chatId,
          },
          score: item.score || 0,
          snippet: (item.memory || item.text || '').substring(0, 200),
        }));
      } catch (error) {
        console.error('[Mem0Service] Mem0 search failed, falling back to IndexedDB:', error);
      }
    }

    // Fallback to IndexedDB keyword search
    const memories = await this._indexedDB.searchMemories(query);

    return memories.map((memory) => ({
      memory,
      score: 0.5, // Default score for keyword search
      snippet: memory.content.substring(0, 200),
    }));
  }

  /**
   * Delete a memory
   */
  async deleteMemory(memoryId: string): Promise<MemoryOperationResult> {
    // Try Mem0 first
    if (this._isAvailable()) {
      try {
        await this._client!.delete(memoryId);

        // Also delete from IndexedDB
        await this._indexedDB.deleteMemory(memoryId);

        return {
          success: true,
          memoryId,
          backend: 'mem0',
        };
      } catch (error: any) {
        console.error('[Mem0Service] Mem0 delete failed, falling back to IndexedDB:', error);
      }
    }

    // Fallback to IndexedDB only
    try {
      await this._indexedDB.deleteMemory(memoryId);
      return {
        success: true,
        memoryId,
        backend: 'indexeddb',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        backend: 'indexeddb',
      };
    }
  }

  /**
   * Get relevant context for current conversation
   */
  async getRelevantContext(options: ContextOptions): Promise<RetrievedContext> {
    const { chatId, messages = [], limit = 10 } = options;

    // Build search query from recent messages
    const recentMessages = messages.slice(-3);
    const searchQuery = recentMessages.map((m) => m.content).join(' ');

    // Search for relevant memories
    const searchResults = await this.searchMemories(searchQuery, { chatId, limit });

    // Also get chat-specific memories
    const chatMemories = await this.getMemories({ chatId, limit: 5 });

    // Combine and deduplicate
    const allMemories = [...searchResults.map((r) => r.memory), ...chatMemories];
    const uniqueMemories = Array.from(new Map(allMemories.map((m) => [m.id, m])).values());

    // Sort by importance and recency
    const sortedMemories = uniqueMemories.sort((a, b) => {
      // Prioritize by importance
      const importanceOrder = { high: 3, medium: 2, low: 1 };
      const aImportance = importanceOrder[a.metadata.importance || 'low'];
      const bImportance = importanceOrder[b.metadata.importance || 'low'];

      if (aImportance !== bImportance) {
        return bImportance - aImportance;
      }

      // Then by recency
      return b.timestamp - a.timestamp;
    });

    // Generate summary
    const summary = this._generateSummary(sortedMemories);

    // Format for prompt
    const formattedForPrompt = this.formatMemoriesForPrompt(sortedMemories);

    // Calculate average confidence
    const confidence =
      sortedMemories.length > 0
        ? sortedMemories.reduce((sum, m) => sum + (m.metadata.confidence || 0.7), 0) / sortedMemories.length
        : 0;

    return {
      memories: sortedMemories.slice(0, limit),
      summary,
      formattedForPrompt,
      confidence,
    };
  }

  /**
   * Generate a summary from memories
   */
  private _generateSummary(memories: Memory[]): string {
    if (memories.length === 0) {
      return 'No previous context available.';
    }

    const projectMemories = memories.filter((m) => m.type === 'project');
    const preferenceMemories = memories.filter((m) => m.type === 'preference');
    const decisionMemories = memories.filter((m) => m.type === 'decision');

    const parts: string[] = [];

    if (projectMemories.length > 0) {
      parts.push(`Project: ${projectMemories[0].content}`);
    }

    if (preferenceMemories.length > 0) {
      parts.push(
        `Preferences: ${preferenceMemories
          .slice(0, 2)
          .map((m) => m.content)
          .join('; ')}`,
      );
    }

    if (decisionMemories.length > 0) {
      parts.push(
        `Decisions: ${decisionMemories
          .slice(0, 2)
          .map((m) => m.content)
          .join('; ')}`,
      );
    }

    return parts.join(' | ');
  }

  /**
   * Format memories for insertion into prompt
   */
  formatMemoriesForPrompt(memories: Memory[]): string {
    if (memories.length === 0) {
      return '';
    }

    const sections: string[] = [];

    sections.push('[CONTEXT FROM PREVIOUS WORK]');
    sections.push('');

    // Group by type
    const byType = memories.reduce(
      (acc, m) => {
        if (!acc[m.type]) {
          acc[m.type] = [];
        }

        acc[m.type].push(m);

        return acc;
      },
      {} as Record<string, Memory[]>,
    );

    if (byType.project) {
      sections.push('Project Context:');
      byType.project.forEach((m) => sections.push(`- ${m.content}`));
      sections.push('');
    }

    if (byType.preference) {
      sections.push('User Preferences:');
      byType.preference.forEach((m) => sections.push(`- ${m.content}`));
      sections.push('');
    }

    if (byType.decision) {
      sections.push('Previous Decisions:');
      byType.decision.forEach((m) => sections.push(`- ${m.content}`));
      sections.push('');
    }

    if (byType.structure) {
      sections.push('Project Structure:');
      byType.structure.forEach((m) => sections.push(`- ${m.content}`));
      sections.push('');
    }

    sections.push('[END CONTEXT]');
    sections.push('');

    return sections.join('\n');
  }
}

// Singleton instance
let mem0ServiceInstance: Mem0Service | null = null;

/**
 * Get or create Mem0 service instance
 */
export function getMem0Service(config: Mem0Config): Mem0Service {
  if (!mem0ServiceInstance || mem0ServiceInstance.config !== config) {
    mem0ServiceInstance = new Mem0Service(config);
  }

  return mem0ServiceInstance;
}
