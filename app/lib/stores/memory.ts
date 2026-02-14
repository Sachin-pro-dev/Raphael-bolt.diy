/**
 * Memory Store - Nanostores-based state management for Mem0 integration
 *
 * This store manages the global state for memory operations including:
 * - Loaded memories
 * - Configuration settings
 * - Loading states
 * - Statistics
 */

import { atom, map } from 'nanostores';
import type { Memory, MemoryStats, Mem0Config, AutoSaveConfig } from '~/types/memory';

/**
 * Memory configuration store
 * Persisted in localStorage
 */
export const memoryConfig = map<Mem0Config>({
  enabled: false, // Disabled by default for existing users
  apiKey: typeof localStorage !== 'undefined' ? localStorage.getItem('mem0_api_key') || undefined : undefined,
  baseUrl:
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('mem0_base_url') || 'https://api.mem0.ai'
      : 'https://api.mem0.ai',
  userId: typeof localStorage !== 'undefined' ? localStorage.getItem('mem0_user_id') || undefined : undefined,
  organizationId: typeof localStorage !== 'undefined' ? localStorage.getItem('mem0_org_id') || undefined : undefined,
});

/**
 * Auto-save configuration
 */
export const autoSaveConfig = map<AutoSaveConfig>({
  enabled: typeof localStorage !== 'undefined' ? localStorage.getItem('mem0_auto_save') === 'true' : true,
  debounceMs: 30000, // 30 seconds
  minMessageLength: 50, // Minimum message length to trigger save
  saveOnArtifactCreate: true,
  saveOnModelSwitch: true,
});

/**
 * Currently loaded memories
 */
export const loadedMemories = atom<Memory[]>([]);

/**
 * Memory loading state
 */
export const memoryLoadingState = map({
  isLoading: false,
  isSaving: false,
  isSearching: false,
  error: undefined as string | undefined,
});

/**
 * Memory statistics
 */
export const memoryStats = map<MemoryStats>({
  total: 0,
  byType: {
    project: 0,
    preference: 0,
    decision: 0,
    structure: 0,
    highlight: 0,
  },
  byImportance: {
    high: 0,
    medium: 0,
    low: 0,
  },
  oldestTimestamp: Date.now(),
  newestTimestamp: Date.now(),
});

/**
 * Last sync timestamp
 */
export const lastSync = atom<number | undefined>(undefined);

/**
 * Current context summary (from loaded memories)
 */
export const contextSummary = atom<string>('');

/**
 * Helper functions for memory config
 */
export const memoryConfigHelpers = {
  /**
   * Enable or disable Mem0
   */
  setEnabled(enabled: boolean) {
    console.log('[MemoryConfig] Setting enabled:', enabled);
    memoryConfig.setKey('enabled', enabled);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mem0_enabled', enabled.toString());
    }
  },

  /**
   * Set API key
   */
  setApiKey(apiKey: string) {
    console.log('[MemoryConfig] Setting API key:', apiKey ? '***' + apiKey.slice(-4) : 'none');
    memoryConfig.setKey('apiKey', apiKey);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mem0_api_key', apiKey);
    }
  },

  /**
   * Set base URL (for self-hosted)
   */
  setBaseUrl(baseUrl: string) {
    console.log('[MemoryConfig] Setting base URL:', baseUrl);
    memoryConfig.setKey('baseUrl', baseUrl);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mem0_base_url', baseUrl);
    }
  },

  /**
   * Set user ID
   */
  setUserId(userId: string) {
    console.log('[MemoryConfig] Setting user ID:', userId);
    memoryConfig.setKey('userId', userId);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mem0_user_id', userId);
    }
  },

  /**
   * Get current config
   */
  getConfig(): Mem0Config {
    // Always read fresh from localStorage to ensure we have the latest values
    const config: Mem0Config = {
      enabled: typeof localStorage !== 'undefined' ? localStorage.getItem('mem0_enabled') === 'true' : false,
      apiKey: typeof localStorage !== 'undefined' ? localStorage.getItem('mem0_api_key') || undefined : undefined,
      baseUrl:
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('mem0_base_url') || 'https://api.mem0.ai'
          : 'https://api.mem0.ai',
      userId: typeof localStorage !== 'undefined' ? localStorage.getItem('mem0_user_id') || undefined : undefined,
      organizationId:
        typeof localStorage !== 'undefined' ? localStorage.getItem('mem0_org_id') || undefined : undefined,
    };

    console.log('[MemoryConfig] getConfig:', {
      enabled: config.enabled,
      hasApiKey: !!config.apiKey,
      baseUrl: config.baseUrl,
      userId: config.userId,
    });

    return config;
  },

  /**
   * Check if Mem0 is enabled and configured
   */
  isReady(): boolean {
    const config = this.getConfig();
    const ready = config.enabled && !!config.apiKey;
    console.log('[MemoryConfig] isReady:', ready);

    return ready;
  },
};

/**
 * Helper functions for auto-save config
 */
export const autoSaveConfigHelpers = {
  /**
   * Enable or disable auto-save
   */
  setEnabled(enabled: boolean) {
    autoSaveConfig.setKey('enabled', enabled);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mem0_auto_save', enabled.toString());
    }
  },

  /**
   * Get current auto-save config
   */
  getConfig(): AutoSaveConfig {
    return autoSaveConfig.get();
  },
};

/**
 * Helper functions for loaded memories
 */
export const memoryHelpers = {
  /**
   * Add a memory to the loaded set
   */
  addMemory(memory: Memory) {
    const current = loadedMemories.get();
    loadedMemories.set([...current, memory]);
    this.updateStats();
  },

  /**
   * Remove a memory from the loaded set
   */
  removeMemory(memoryId: string) {
    const current = loadedMemories.get();
    loadedMemories.set(current.filter((m) => m.id !== memoryId));
    this.updateStats();
  },

  /**
   * Clear all loaded memories
   */
  clearMemories() {
    loadedMemories.set([]);
    this.updateStats();
  },

  /**
   * Update memory statistics
   */
  updateStats() {
    const memories = loadedMemories.get();

    const stats: MemoryStats = {
      total: memories.length,
      byType: {
        project: memories.filter((m) => m.type === 'project').length,
        preference: memories.filter((m) => m.type === 'preference').length,
        decision: memories.filter((m) => m.type === 'decision').length,
        structure: memories.filter((m) => m.type === 'structure').length,
        highlight: memories.filter((m) => m.type === 'highlight').length,
      },
      byImportance: {
        high: memories.filter((m) => m.metadata.importance === 'high').length,
        medium: memories.filter((m) => m.metadata.importance === 'medium').length,
        low: memories.filter((m) => m.metadata.importance === 'low').length,
      },
      oldestTimestamp: memories.length > 0 ? Math.min(...memories.map((m) => m.timestamp)) : Date.now(),
      newestTimestamp: memories.length > 0 ? Math.max(...memories.map((m) => m.timestamp)) : Date.now(),
    };

    memoryStats.set(stats);
  },

  /**
   * Get memories by type
   */
  getMemoriesByType(type: Memory['type']): Memory[] {
    return loadedMemories.get().filter((m) => m.type === type);
  },

  /**
   * Get memories by importance
   */
  getMemoriesByImportance(importance: 'high' | 'medium' | 'low'): Memory[] {
    return loadedMemories.get().filter((m) => m.metadata.importance === importance);
  },
};

/**
 * Initialize memory store from localStorage
 */
if (typeof window !== 'undefined') {
  // Load saved config on startup
  const savedEnabled = localStorage.getItem('mem0_enabled');

  if (savedEnabled !== null) {
    memoryConfig.setKey('enabled', savedEnabled === 'true');
  }

  const savedAutoSave = localStorage.getItem('mem0_auto_save');

  if (savedAutoSave !== null) {
    autoSaveConfig.setKey('enabled', savedAutoSave === 'true');
  }
}
