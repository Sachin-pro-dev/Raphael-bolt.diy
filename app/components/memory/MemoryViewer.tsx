/**
 * Memory Viewer Dialog - Professional Design
 *
 * Displays all saved memories with filtering and management options
 */

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { memoryConfigHelpers } from '~/lib/stores/memory';
import type { Memory } from '~/types/memory';
import * as Dialog from '@radix-ui/react-dialog';

interface MemoryViewerProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
}

export function MemoryViewer({ isOpen, onClose, chatId }: MemoryViewerProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'project' | 'preference' | 'decision' | 'highlight'>('all');

  useEffect(() => {
    if (isOpen) {
      loadMemories();
    }
  }, [isOpen, chatId]);

  const loadMemories = async () => {
    setIsLoading(true);

    try {
      console.log('[MemoryViewer] Loading memories...');

      const config = memoryConfigHelpers.getConfig();

      if (!config.apiKey) {
        toast.error('No Mem0 API key configured');
        setIsLoading(false);

        return;
      }

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (config.apiKey) {
        headers['x-mem0-api-key'] = config.apiKey;
      }

      const url = new URL('/api/memory', window.location.origin);
      url.searchParams.set('chatId', chatId);

      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      const result = (await response.json()) as {
        success: boolean;
        memories: Memory[];
        error?: string;
      };

      console.log('[MemoryViewer] Load result:', result);

      if (result.success) {
        setMemories(result.memories);

        if (result.memories.length > 0) {
          toast.success(`Loaded ${result.memories.length} memories`);
        }
      } else {
        toast.error(result.error || 'Failed to load memories');
      }
    } catch (error: any) {
      console.error('[MemoryViewer] Error:', error);
      toast.error('Failed to load memories');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (memoryId: string) => {
    if (!confirm('Are you sure you want to delete this memory?')) {
      return;
    }

    try {
      const config = memoryConfigHelpers.getConfig();

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (config.apiKey) {
        headers['x-mem0-api-key'] = config.apiKey;
      }

      const response = await fetch(`/api/memory?id=${memoryId}`, {
        method: 'DELETE',
        headers,
      });

      const result = (await response.json()) as { success: boolean; error?: string };

      if (result.success) {
        setMemories((prev) => prev.filter((m) => m.id !== memoryId));
        toast.success('Memory deleted');
      } else {
        toast.error(result.error || 'Failed to delete memory');
      }
    } catch (error: any) {
      console.error('[MemoryViewer] Delete error:', error);
      toast.error('Failed to delete memory');
    }
  };

  const filteredMemories = filter === 'all' ? memories : memories.filter((m) => m.type === filter);

  const stats = {
    total: memories.length,
    project: memories.filter((m) => m.type === 'project').length,
    preference: memories.filter((m) => m.type === 'preference').length,
    decision: memories.filter((m) => m.type === 'decision').length,
    highlight: memories.filter((m) => m.type === 'highlight').length,
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'project':
        return 'i-ph:folder-open';
      case 'preference':
        return 'i-ph:heart';
      case 'decision':
        return 'i-ph:lightbulb';
      case 'highlight':
        return 'i-ph:star';
      default:
        return 'i-ph:file';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'project':
        return 'from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400';
      case 'preference':
        return 'from-green-500/20 to-green-600/10 border-green-500/30 text-green-400';
      case 'decision':
        return 'from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-400';
      case 'highlight':
        return 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30 text-yellow-400';
      default:
        return 'from-gray-500/20 to-gray-600/10 border-gray-500/30 text-gray-400';
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-5xl max-h-[90vh] bg-gradient-to-br from-bolt-elements-background-depth-2 to-bolt-elements-background-depth-3 rounded-2xl shadow-2xl border border-bolt-elements-borderColor z-50 overflow-hidden flex flex-col animate-in zoom-in-95 fade-in duration-200">
          {/* Header with Gradient */}
          <div className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-purple-500/10" />
            <div className="relative flex items-center justify-between p-6 border-b border-bolt-elements-borderColor/50 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
                  <div className="i-ph:brain text-2xl text-white" />
                </div>
                <div>
                  <Dialog.Title className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                    Saved Memories
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-bolt-elements-textSecondary mt-0.5">
                    View and manage your conversation context
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close className="w-10 h-10 rounded-lg flex items-center justify-center text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-1 transition-all">
                <div className="i-ph:x text-xl" />
              </Dialog.Close>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 p-4 border-b border-bolt-elements-borderColor/50 bg-bolt-elements-background-depth-1/50 overflow-x-auto">
            {[
              { key: 'all', label: 'All', count: stats.total, icon: 'i-ph:stack', color: 'blue' },
              { key: 'project', label: 'Projects', count: stats.project, icon: 'i-ph:folder-open', color: 'blue' },
              {
                key: 'preference',
                label: 'Preferences',
                count: stats.preference,
                icon: 'i-ph:heart',
                color: 'green',
              },
              {
                key: 'decision',
                label: 'Decisions',
                count: stats.decision,
                icon: 'i-ph:lightbulb',
                color: 'purple',
              },
              {
                key: 'highlight',
                label: 'Highlights',
                count: stats.highlight,
                icon: 'i-ph:star',
                color: 'yellow',
              },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as any)}
                className={classNames(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 whitespace-nowrap',
                  filter === tab.key
                    ? `bg-${tab.color}-500/20 text-${tab.color}-400 border border-${tab.color}-500/30 shadow-lg shadow-${tab.color}-500/20`
                    : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 border border-transparent',
                )}
              >
                <div className={`${tab.icon} text-lg`} />
                <span className="text-sm">{tab.label}</span>
                <span
                  className={classNames(
                    'px-2 py-0.5 rounded-full text-xs font-bold',
                    filter === tab.key
                      ? `bg-${tab.color}-500/30`
                      : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary',
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Memories List */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                  <div className="i-ph:spinner text-4xl animate-spin text-purple-400" />
                </div>
                <p className="text-sm text-bolt-elements-textSecondary">Loading memories...</p>
              </div>
            ) : filteredMemories.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-bolt-elements-background-depth-3 to-bolt-elements-background-depth-2 border border-bolt-elements-borderColor flex items-center justify-center">
                  <div className="i-ph:file-dashed text-6xl text-bolt-elements-textTertiary" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-bolt-elements-textPrimary mb-1">No memories found</p>
                  <p className="text-sm text-bolt-elements-textSecondary max-w-sm">
                    Start chatting and memories will be saved automatically, or click the brain icon to save manually
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMemories.map((memory, index) => (
                  <div
                    key={memory.id}
                    className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-bolt-elements-background-depth-1 to-bolt-elements-background-depth-2 border border-bolt-elements-borderColor hover:border-bolt-elements-focus transition-all duration-200 hover:shadow-lg animate-in slide-in-from-bottom"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-bolt-elements-background-depth-3/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={classNames(
                              'w-8 h-8 rounded-lg bg-gradient-to-br border flex items-center justify-center',
                              getTypeColor(memory.type),
                            )}
                          >
                            <div className={`${getTypeIcon(memory.type)} text-base`} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold uppercase tracking-wider text-bolt-elements-textSecondary">
                              {memory.type}
                            </span>
                            {memory.metadata.importance && (
                              <div className="flex items-center gap-0.5 mt-0.5">
                                {Array.from({ length: 3 }).map((_, i) => (
                                  <div
                                    key={i}
                                    className={classNames(
                                      'w-1.5 h-1.5 rounded-full',
                                      i <
                                        (memory.metadata.importance === 'high'
                                          ? 3
                                          : memory.metadata.importance === 'medium'
                                            ? 2
                                            : 1)
                                        ? 'bg-yellow-400'
                                        : 'bg-bolt-elements-background-depth-3',
                                    )}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-bolt-elements-textTertiary font-mono">
                            {new Date(memory.timestamp).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          <button
                            onClick={() => handleDelete(memory.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-bolt-elements-textTertiary hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                            title="Delete memory"
                          >
                            <div className="i-ph:trash text-lg" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-bolt-elements-textPrimary leading-relaxed pl-10.5">{memory.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-bolt-elements-borderColor/50 bg-bolt-elements-background-depth-1/50 backdrop-blur-sm">
            <button
              onClick={loadMemories}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
            >
              <div className={classNames('i-ph:arrow-clockwise text-lg', isLoading && 'animate-spin')} />
              Refresh
            </button>
            <Dialog.Close asChild>
              <button className="px-4 py-2.5 text-sm font-medium rounded-lg bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary transition-all border border-bolt-elements-borderColor hover:border-bolt-elements-focus">
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
