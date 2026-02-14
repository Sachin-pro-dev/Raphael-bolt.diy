/**
 * IndexedDB Memory Backup (Client-Side Only)
 *
 * Standalone IndexedDB storage for memories
 * Used as fallback when Mem0 API is unavailable
 */

import type { Memory } from '~/types/memory';

export class MemoryIndexedDBBackup {
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
}
