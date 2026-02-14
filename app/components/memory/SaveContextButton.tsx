/**
 * Save Context Button Component
 *
 * Allows users to manually save the current context to memory
 */

import { useState } from 'react';
import { toast } from 'react-toastify';
import { IconButton } from '~/components/ui/IconButton';
import { memoryConfigHelpers } from '~/lib/stores/memory';

interface SaveContextButtonProps {
  chatId: string;
  context: string;
  onSaved?: () => void;
}

export function SaveContextButton({ chatId, context, onSaved }: SaveContextButtonProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    console.log('[SaveContextButton] Save clicked');

    if (!context || context.trim().length === 0) {
      console.warn('[SaveContextButton] No context to save');
      toast.error('No context to save');

      return;
    }

    const config = memoryConfigHelpers.getConfig();
    console.log('[SaveContextButton] Config:', {
      enabled: config.enabled,
      hasApiKey: !!config.apiKey,
    });

    if (!config.enabled) {
      console.warn('[SaveContextButton] Memory feature is not enabled');
      toast.error('Memory feature is not enabled. Enable it in Settings → Memory tab.');

      return;
    }

    if (!config.apiKey) {
      console.warn('[SaveContextButton] No API key configured');
      toast.warning('No Mem0 API key configured. Saving to browser storage only.');
    }

    setIsSaving(true);

    try {
      console.log('[SaveContextButton] Sending save request...');

      // Prepare headers with API key if available
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (config.apiKey) {
        headers['x-mem0-api-key'] = config.apiKey;
      }

      const response = await fetch('/api/memory', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          chatId,
          content: context,
          type: 'highlight',
          importance: 'high',
          metadata: {
            manualSave: true,
            timestamp: Date.now(),
          },
        }),
      });

      const result = (await response.json()) as {
        success: boolean;
        error?: string;
        backend?: string;
        memoryId?: string;
        shouldUseClientStorage?: boolean;
      };

      console.log('[SaveContextButton] Save result:', result);

      // If server says to use client storage, fall back to IndexedDB ONLY (no Mem0 client to avoid CORS)
      if (!result.success && result.shouldUseClientStorage) {
        console.log('[SaveContextButton] Server unavailable, using IndexedDB...');

        try {
          // Import standalone IndexedDB module (no Mem0 client = no CORS issues)
          const { MemoryIndexedDBBackup: memoryIndexedDBBackup } = await import('~/lib/services/memoryIndexedDB');
          const indexedDB = new memoryIndexedDBBackup();

          await indexedDB.init();

          const memory = {
            id: crypto.randomUUID(),
            content: context,
            type: 'highlight' as const,
            metadata: {
              chatId,
              importance: 'high' as const,
              manualSave: true,
              timestamp: Date.now(),
            },
            timestamp: Date.now(),
            userId: chatId,
            chatId,
          };

          await indexedDB.saveMemory(memory);

          console.log('[SaveContextButton] Saved to IndexedDB:', memory.id);

          toast.success('Context saved to browser storage!', {
            autoClose: 3000,
          });
          onSaved?.();
          setIsSaving(false);

          return;
        } catch (dbError: any) {
          console.error('[SaveContextButton] IndexedDB fallback failed:', dbError);
          toast.error(dbError?.message || 'Failed to save context to browser storage');
          setIsSaving(false);

          return;
        }
      }

      if (result.success) {
        const backendName = result.backend === 'mem0' ? 'Mem0 cloud' : 'browser storage';
        toast.success(`Context saved to ${backendName}!`, {
          autoClose: 3000,
        });
        onSaved?.();
      } else {
        console.error('[SaveContextButton] Save failed:', result.error);
        toast.error(result.error || 'Failed to save context. Check console for details.');
      }
    } catch (error: any) {
      console.error('[SaveContextButton] Request error:', error);
      toast.error('Failed to save context. Network error - check console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <IconButton
      title="Save current context to memory (Ctrl/Cmd + Shift + S)"
      disabled={isSaving || !context || context.trim().length === 0}
      onClick={handleSave}
      className="transition-all"
    >
      {isSaving ? <div className="i-ph:spinner text-xl animate-spin" /> : <div className="i-ph:brain text-xl" />}
    </IconButton>
  );
}
